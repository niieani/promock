use swc_core::{
    common::{util::take::Take, Span, DUMMY_SP},
    ecma::{
        ast::{
            BindingIdent, CallExpr, Callee, ClassDecl, Decl, DefaultDecl, ExportDecl,
            ExportDefaultExpr, Expr, ExprOrSpread, ExprStmt, FnDecl, FnExpr, Function, Ident,
            ImportDecl, ImportNamedSpecifier, ImportSpecifier, Lit, Module, ModuleDecl,
            ModuleExportName, ModuleItem, Pat, Program, Stmt, Str, VarDecl, VarDeclKind,
            VarDeclarator,
        },
        transforms::testing::test,
        visit::{as_folder, FoldWith, VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};

#[derive(Default)]
pub struct TransformVisitor {
    mockify_used: bool, // Add a flag to know if mockify was used
    do_not_mockify: bool,
    added: Vec<ModuleItem>,
}

fn transform_fn_decl_to_fn_expr(fn_decl: &FnDecl) -> Expr {
    let function_expr = Function {
        is_generator: fn_decl.function.is_generator,
        is_async: fn_decl.function.is_async,
        params: fn_decl.function.params.clone(),
        body: Some(fn_decl.function.body.as_ref().unwrap().clone()),
        type_params: fn_decl.function.type_params.clone(),
        return_type: fn_decl.function.return_type.clone(),
        decorators: fn_decl.function.decorators.clone(),
        span: fn_decl.function.span,
    };
    Expr::Fn(FnExpr {
        ident: Some(fn_decl.ident.clone()),
        function: Box::new(function_expr),
    })
}

fn wrap_with_mockify(span: Span, expr: Expr) -> Expr {
    Expr::Call(CallExpr {
        span,
        callee: Callee::Expr(Box::new(Expr::Ident(Ident {
            span,
            sym: "mockify".into(),
            optional: false,
        }))),
        args: vec![ExprOrSpread {
            expr: Box::new(expr),
            spread: None,
        }],
        type_args: None,
    })
}

impl VisitMut for TransformVisitor {
    fn visit_mut_module(&mut self, m: &mut Module) {
        m.visit_mut_children_with(self);
        if !self.mockify_used {
            return;
        }

        // If mockify was used, prepend the import statement
        let mockify_import = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                span: DUMMY_SP,
                local: Ident::new("mockify".into(), DUMMY_SP),
                imported: Some(ModuleExportName::Ident(Ident::new(
                    "mockify".into(),
                    DUMMY_SP,
                ))),
                is_type_only: false,
            })],
            src: Box::new(Str {
                value: "mockify".into(),
                span: DUMMY_SP,
                raw: None,
            }),
            type_only: false,
            with: None,
        }));

        // Prepend our stored statements
        let prepend_items: Vec<ModuleItem> = self.added.drain(..).collect();
        m.body.splice(0..0, prepend_items);

        // Prepend the mockify import
        m.body.insert(0, mockify_import);
    }
    fn visit_mut_expr_stmt(&mut self, n: &mut ExprStmt) {
        match &*n.expr {
            Expr::Lit(lit) => {
                if let Lit::Str(str_lit) = lit {
                    if str_lit.value.eq("__do_not_mockify__") {
                        self.do_not_mockify = true;
                    }
                }
            }
            _ => {}
        }
    }
    // Implement necessary visit_mut_* methods for actual custom transform.
    // A comprehensive list of possible visitor methods can be found here:
    // https://rustdoc.swc.rs/swc_ecma_visit/trait.VisitMut.html
    fn visit_mut_module_item(&mut self, item: &mut ModuleItem) {
        match item {
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &mut export.decl {
                Decl::Var(var_decl) if var_decl.kind == VarDeclKind::Const => {
                    for decl in &mut var_decl.decls {
                        if let Some(init) = &mut decl.init {
                            self.mockify_used = true;
                            *init = Box::new(wrap_with_mockify(decl.span, *(*init).take()));
                        }
                    }
                }
                Decl::Fn(fn_decl) => {
                    self.mockify_used = true;
                    let fn_expr = transform_fn_decl_to_fn_expr(&fn_decl);
                    let wrapped_expr = wrap_with_mockify(fn_decl.function.span, fn_expr);
                    let decl = Decl::Var(Box::new(VarDecl {
                        span: fn_decl.function.span,
                        kind: VarDeclKind::Const,
                        declare: false,
                        decls: vec![VarDeclarator {
                            span: fn_decl.function.span,
                            name: Pat::Ident(BindingIdent {
                                id: fn_decl.ident.clone(),
                                type_ann: None,
                            }),
                            init: Some(Box::new(wrapped_expr)),
                            definite: false,
                        }],
                    }));
                    *item = ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                        span: export.span,
                        decl,
                    }));
                }
                _ => {}
            },
            _ => item.visit_mut_children_with(self),
        }
    }

    fn visit_mut_module_decl(&mut self, item: &mut ModuleDecl) {
        if self.do_not_mockify {
            return;
        }
        match item {
            ModuleDecl::ExportDefaultExpr(export) => {
                self.mockify_used = true;
                *export.expr = wrap_with_mockify(export.span, *export.expr.clone());
            }

            // TODO: these two, and the 'fn' above are broken, because they remove the identifier from scope
            // which may cause a ReferenceError in runtime
            // we need to drop the 'export default' from the original declaration,
            // then add another statement with: 'export default mockify($identifier)'
            ModuleDecl::ExportDefaultDecl(export) => match &export.decl {
                DefaultDecl::Fn(fn_expr) => {
                    self.mockify_used = true;

                    // handle case where function ident doesn't exist
                    // in which case we can simply wrap the expression directly
                    if fn_expr.ident.is_none() {
                        let wrapped_expr =
                            wrap_with_mockify(fn_expr.function.span, Expr::Fn(fn_expr.clone()));

                        // Replace the exported default function declaration with a wrapped expression
                        *item = ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                            span: export.span,
                            expr: Box::new(wrapped_expr),
                        });
                        return;
                    }

                    // Add the original declaration without the 'export default'
                    // we can safely unwrap here because we know the ident exists
                    let original_ident = fn_expr.ident.clone().unwrap();
                    let ident = original_ident.clone();
                    let original_stmt = Stmt::Decl(Decl::Fn(FnDecl {
                        ident: original_ident,
                        function: Box::new((*fn_expr.function).clone()),
                        declare: false,
                    }));

                    self.added.push(ModuleItem::Stmt(original_stmt));

                    let wrapped_expr = wrap_with_mockify(DUMMY_SP, Expr::Ident(ident));

                    // Replace the exported default function declaration with a wrapped expression
                    *item = ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                        span: export.span,
                        expr: Box::new(wrapped_expr),
                    });
                }
                DefaultDecl::Class(class_expr) => {
                    self.mockify_used = true;

                    // handle case where class ident doesn't exist
                    // in which case we can simply wrap the expression directly
                    if class_expr.ident.is_none() {
                        let wrapped_expr = wrap_with_mockify(
                            class_expr.class.span,
                            Expr::Class(class_expr.clone()),
                        );

                        // Replace the exported default class declaration with a wrapped expression
                        *item = ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                            span: export.span,
                            expr: Box::new(wrapped_expr),
                        });
                        return;
                    }

                    // Add the original declaration without the 'export default'
                    // we can safely unwrap here because we know the ident exists
                    let original_ident = class_expr.ident.clone().unwrap();
                    let ident = original_ident.clone();
                    let original_stmt = Stmt::Decl(Decl::Class(ClassDecl {
                        ident: original_ident,
                        class: Box::new((*class_expr.class).clone()),
                        declare: false,
                    }));

                    self.added.push(ModuleItem::Stmt(original_stmt));

                    let wrapped_expr = wrap_with_mockify(DUMMY_SP, Expr::Ident(ident));

                    // Replace the exported default class declaration with a wrapped expression
                    *item = ModuleDecl::ExportDefaultExpr(ExportDefaultExpr {
                        span: export.span,
                        expr: Box::new(wrapped_expr),
                    });
                }
                _ => {}
            },
            _ => {}
        }
    }
}

#[plugin_transform]
pub fn process_transform(program: Program, _metadata: TransformPluginProgramMetadata) -> Program {
    program.fold_with(&mut as_folder(TransformVisitor::default()))
}

// Testing exported const
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    export_const,
    // Input codes
    r#"export const example = {};"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export const example = mockify({});"#
);

// Testing exported functions

// this is complicated to mockify correctly,
// because of scope hoisting for function declarations in JavaScript
// the function might be used before it is declared
// in which case we cannot just wrap the function declaration in a mockify call
// instead, we need to:
// 1. drop the export
// function $exampleFn() { return {}; }
// 2. create a mockified version
// const _mockified_$exampleFn = mockify($exampleFn);
// 3. export the mockified version under the original exported name
// export { _mockified_$exampleFn as $exampleFn };
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    export_function,
    // Input codes
    r#"export function example() { return {}; }"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export const example = mockify(function example() { return {}; });"#
);

// Testing default exports
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    default_export,
    // Input codes
    r#"export default {};"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export default mockify({});"#
);

// Testing default exported functions
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    default_export_function,
    // Input codes
    r#"export default function example() { return {}; }"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    function example() { return {}; }
    export default mockify(example);"#
);

// Testing default exported classes
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    default_export_class,
    // Input codes
    r#"export default class Example {}"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    class Example {}
    export default mockify(Example);"#
);

// Do not add imports if mockify is not used
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    no_added_imports,
    // Input codes
    r#"class Example {}"#,
    // Output codes after transformed with plugin
    r#"class Example {}"#
);

// Does not change code if __do_not_mockify__ is used
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::default()),
    do_not_mockify,
    // Input codes
    r#""__do_not_mockify__";
    export const example = {};"#,
    // Output codes after transformed with plugin
    r#""__do_not_mockify__";
    export const example = {};"#
);
