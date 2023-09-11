use pathdiff::diff_paths;
use serde::Deserialize;
use std::collections::HashMap;

use regex::Regex;
use swc_core::{
    common::{util::take::Take, Span, DUMMY_SP},
    ecma::{
        ast::{
            BindingIdent, CallExpr, Callee, ClassDecl, Decl, DefaultDecl, ExportDefaultExpr,
            ExportNamedSpecifier, ExportSpecifier, Expr, ExprOrSpread, ExprStmt, FnDecl, Ident,
            ImportDecl, ImportNamedSpecifier, ImportSpecifier, Lit, Module, ModuleDecl,
            ModuleExportName, ModuleItem, NamedExport, Pat, Program, Stmt, Str, VarDecl,
            VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        transforms::testing::test,
        visit::{as_folder, FoldWith, VisitMut, VisitMutWith},
    },
    plugin::{plugin_transform, proxies::TransformPluginProgramMetadata},
};
#[macro_use]
extern crate lazy_static;

/// Static plugin configuration.
#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// The name of the module to import mockify from.
    #[serde(default = "default_import_from")]
    pub import_from: String,

    #[serde(default = "default_import_as")]
    pub import_as: String,

    #[serde(default = "default_export_name")]
    pub export_name: String,

    /// The base directory to use for relative paths.
    #[serde()]
    pub base_path: String,

    #[serde(default = "default_include_paths", with = "serde_regex")]
    pub include_paths: Option<Vec<Regex>>,

    #[serde(default = "default_exclude_paths", with = "serde_regex")]
    pub exclude_paths: Option<Vec<Regex>>,
}

// when not defined, include all paths by default
fn default_include_paths() -> Option<Vec<Regex>> {
    None
}
fn default_exclude_paths() -> Option<Vec<Regex>> {
    None
}
fn default_import_as() -> String {
    "mockify".into()
}
fn default_import_from() -> String {
    "promock".into()
}
fn default_export_name() -> String {
    "mockify".into()
}

pub struct TransformVisitor {
    config: Config,
    mockify_used: bool, // Add a flag to know if mockify was used
    do_not_mockify: bool,
    added_to_top_of_file: Vec<ModuleItem>,
    added_to_bottom_of_file: Vec<ModuleItem>,
    mockified_identifiers: HashMap<JsWord, JsWord>,
}

impl TransformVisitor {
    pub fn new(config: Option<Config>) -> Self {
        Self {
            config: match config {
                Some(config) => config,
                None => Config {
                    import_from: default_import_from(),
                    import_as: default_import_as(),
                    export_name: default_export_name(),
                    base_path: ".".into(),
                    include_paths: None,
                    exclude_paths: None,
                },
            },
            added_to_bottom_of_file: vec![],
            added_to_top_of_file: vec![],
            mockify_used: false,
            do_not_mockify: false,
            mockified_identifiers: HashMap::new(),
        }
    }
}

fn wrap_with_mockify(span: Span, expr: Expr, config: Config) -> Expr {
    Expr::Call(CallExpr {
        span,
        callee: Callee::Expr(Box::new(Expr::Ident(Ident {
            span: DUMMY_SP,
            sym: config.import_as.clone().into(),
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

        if self.do_not_mockify {
            return;
        }
        if !self.mockify_used {
            return;
        }

        let import_config = self.config.clone();
        // If mockify was used, prepend the import statement
        let mockify_import = ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![ImportSpecifier::Named(ImportNamedSpecifier {
                span: DUMMY_SP,
                local: Ident::new(import_config.import_as.clone().into(), DUMMY_SP),
                imported: Some(ModuleExportName::Ident(Ident::new(
                    import_config.export_name.into(),
                    DUMMY_SP,
                ))),
                is_type_only: false,
            })],
            src: Box::new(Str {
                value: import_config.import_from.into(),
                span: DUMMY_SP,
                raw: None,
            }),
            type_only: false,
            with: None,
        }));

        // Prepend our stored statements
        let prepend_items: Vec<ModuleItem> = self.added_to_top_of_file.drain(..).collect();
        m.body.splice(0..0, prepend_items);
        let append_items: Vec<ModuleItem> = self.added_to_bottom_of_file.drain(..).collect();
        m.body.splice(m.body.len()..m.body.len(), append_items);

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
        if self.do_not_mockify {
            return;
        }
        match item {
            ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(export)) => match &mut export.decl {
                Decl::Var(var_decl) if var_decl.kind == VarDeclKind::Const => {
                    for decl in &mut var_decl.decls {
                        if let Some(init) = &mut decl.init {
                            self.mockify_used = true;
                            *init = Box::new(wrap_with_mockify(
                                decl.span,
                                *(*init).take(),
                                self.config.clone(),
                            ));
                        }
                    }
                }
                Decl::Fn(fn_decl) => {
                    self.mockify_used = true;
                    let orig_ident = fn_decl.ident.clone();
                    let export_ident = fn_decl.ident.clone();
                    let mockified_ident = Ident::new(
                        format!("_mockified_{}", orig_ident.sym).into(),
                        fn_decl.ident.span,
                    );

                    // Drop the export, but keep the original function declaration
                    let original_fn_decl = ModuleItem::Stmt(Stmt::Decl(Decl::Fn(fn_decl.clone())));

                    // Create mockified version
                    let mockified_fn = wrap_with_mockify(
                        fn_decl.function.span,
                        Expr::Ident(orig_ident),
                        self.config.clone(),
                    );
                    let mockified_fn_decl = VarDeclarator {
                        span: fn_decl.function.span,
                        name: Pat::Ident(BindingIdent {
                            id: mockified_ident.clone(),
                            type_ann: None,
                        }),
                        init: Some(Box::new(mockified_fn)),
                        definite: false,
                    };

                    // Add the original and mockified declarations to our stored items
                    self.added_to_top_of_file.push(original_fn_decl);

                    // Export the mockified version under the original exported name
                    let mockified_const_declaration =
                        ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                            span: export.span,
                            specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(mockified_ident),
                                exported: Some(ModuleExportName::Ident(export_ident)),
                                is_type_only: false,
                            })],
                            src: None,
                            type_only: false,
                            with: None,
                        }));

                    let function_declaration_const =
                        ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(VarDecl {
                            span: fn_decl.function.span,
                            kind: VarDeclKind::Const,
                            declare: false,
                            decls: vec![mockified_fn_decl],
                        }))));

                    self.added_to_bottom_of_file
                        .push(mockified_const_declaration);

                    *item = function_declaration_const;
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
            ModuleDecl::ExportNamed(named_export) => {
                // This flag will help us know if we processed any identifiers for mockifying
                let mut mockified_any = false;

                if named_export.src.is_some() {
                    return;
                }

                // For each specifier, mockify its source identifier and adjust the exported name
                let mut new_specifiers = vec![];
                for specifier in &named_export.specifiers {
                    match specifier {
                        ExportSpecifier::Named(named_specifier) => {
                            // The original identifier being exported
                            let original_ident = &named_specifier.orig;
                            let original_export_as = &named_specifier.exported;

                            let original_ident_sym = match original_ident {
                                ModuleExportName::Ident(ident) => ident.sym.clone(),
                                ModuleExportName::Str(str) => str.value.clone(),
                            };

                            let formatted_ident = format!("_mockified_{}", original_ident_sym);
                            // Construct the mockified name, e.g., _mockified_A
                            let mockified_ident =
                                Ident::new(formatted_ident.clone().into(), DUMMY_SP);

                            // If this identifier hasn't been mockified yet, add it to the added Vec
                            if !self.mockified_identifiers.contains_key(&original_ident_sym) {
                                self.mockify_used = true;
                                mockified_any = true;
                                let mockify_stmt = Stmt::Decl(Decl::Var(Box::new(VarDecl {
                                    span: DUMMY_SP,
                                    kind: VarDeclKind::Const,
                                    declare: false,
                                    decls: vec![VarDeclarator {
                                        span: DUMMY_SP,
                                        name: Pat::Ident(BindingIdent {
                                            id: mockified_ident.clone(),
                                            type_ann: None,
                                        }),
                                        init: Some(Box::new(wrap_with_mockify(
                                            DUMMY_SP,
                                            Expr::Ident(Ident::new(
                                                original_ident_sym.clone(),
                                                DUMMY_SP,
                                            )),
                                            self.config.clone(),
                                        ))),
                                        definite: false,
                                    }],
                                })));
                                self.added_to_bottom_of_file
                                    .push(ModuleItem::Stmt(mockify_stmt));

                                // Store this identifier as mockified
                                self.mockified_identifiers.insert(
                                    original_ident_sym.clone(),
                                    formatted_ident.clone().into(),
                                );
                            }

                            // Create a new named export specifier using the mockified name
                            new_specifiers.push(ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: mockified_ident.into(),
                                exported: match original_export_as {
                                    None => Some(original_ident.clone()),
                                    _ => original_export_as.clone(),
                                    // Some(ModuleExportName::Ident(ident)) => {
                                    //     Some(ModuleExportName::Ident(ident.clone()))
                                    // }
                                    // Some(ModuleExportName::Str(str)) => {
                                    //     Some(ModuleExportName::Str(str.clone()))
                                    // }
                                },
                                is_type_only: false,
                            }));
                        }
                        _ => {
                            new_specifiers.push(specifier.clone());
                        }
                    }
                }

                // If we mockified any identifiers, we'll adjust the named export
                if mockified_any {
                    *item = ModuleDecl::ExportNamed(NamedExport {
                        span: named_export.span,
                        specifiers: new_specifiers,
                        src: None,
                        type_only: named_export.type_only,
                        with: named_export.with.as_ref().map(|with| with.clone()),
                    });
                }
            }

            ModuleDecl::ExportDefaultExpr(export) => {
                self.mockify_used = true;
                *export.expr =
                    wrap_with_mockify(export.span, *export.expr.clone(), self.config.clone());
            }

            // we cannot simply replace the function with a const,
            // because that would remove the identifier from scope
            // which may cause a ReferenceError in runtime
            // we need to drop the 'export default' from the original declaration,
            // then add another statement with: 'export default mockify($identifier)'
            ModuleDecl::ExportDefaultDecl(export) => match &export.decl {
                DefaultDecl::Fn(fn_expr) => {
                    self.mockify_used = true;

                    // handle case where function ident doesn't exist
                    // in which case we can simply wrap the expression directly
                    if fn_expr.ident.is_none() {
                        let wrapped_expr = wrap_with_mockify(
                            fn_expr.function.span,
                            Expr::Fn(fn_expr.clone()),
                            self.config.clone(),
                        );

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

                    self.added_to_top_of_file
                        .push(ModuleItem::Stmt(original_stmt));

                    let wrapped_expr =
                        wrap_with_mockify(DUMMY_SP, Expr::Ident(ident), self.config.clone());

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
                            self.config.clone(),
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

                    self.added_to_top_of_file
                        .push(ModuleItem::Stmt(original_stmt));

                    let wrapped_expr =
                        wrap_with_mockify(DUMMY_SP, Expr::Ident(ident), self.config.clone());

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
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    // TODO: running metadata.get_transform_plugin_config() here will cause a panic,
    // so currently we cannot use config
    // let config: Config = serde_json::from_str(
    //     &metadata
    //         .get_transform_plugin_config()
    //         .expect("failed to get plugin config for swc-plugin-mockify"),
    // )
    // .expect("failed to parse plugin config");

    // let file_name = metadata
    //     .get_context(&TransformPluginMetadataContextKind::Filename)
    //     .expect("failed to get filename");
    // let relative_path = relative_posix_path(&config.base_path, &file_name);

    // // If include_paths is defined, only include files that match the regex
    // if let Some(include_paths) = &config.include_paths {
    //     let mut include_file = false;
    //     for include_path in include_paths {
    //         if include_path.is_match(&relative_path) {
    //             include_file = true;
    //             break;
    //         }
    //     }
    //     if !include_file {
    //         return program;
    //     }
    // }

    // // If exclude_paths is defined, exclude files that match the regex
    // if let Some(exclude_paths) = &config.exclude_paths {
    //     for exclude_path in exclude_paths {
    //         if exclude_path.is_match(&relative_path) {
    //             return program;
    //         }
    //     }
    // }

    // program.fold_with(&mut as_folder(TransformVisitor::new(Some(config))))
    program.fold_with(&mut as_folder(TransformVisitor::new(None)))
}

// Testing exported const
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    export_const,
    // Input codes
    r#"export const example = {};"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export const example = mockify({});"#
);

// Testing exported functions

// this is tricky to mockify correctly,
// because of scope hoisting for function declarations in JavaScript
// and the function might be used somewhere before it is declared
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
    |_| as_folder(TransformVisitor::new(None)),
    export_function,
    // Input codes
    r#"export function example() { return {}; }"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    function example() { return {}; }
    const _mockified_example = mockify(example);
    export { _mockified_example as example };"#
);

// Testing default exports
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
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
    |_| as_folder(TransformVisitor::new(None)),
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
    |_| as_folder(TransformVisitor::new(None)),
    default_export_class,
    // Input codes
    r#"export default class Example {}"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    class Example {}
    export default mockify(Example);"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    separate_export_declaration,
    // Input codes
    r#"const A = () => {};
    function B() {}
    export { A, B };"#,
    // Output codes after transformed with plugin (assuming A and B are transformed)
    r#"import { mockify as mockify } from "mockify";
    const A = () => {};
    function B() {}
    export { _mockified_A as A, _mockified_B as B };
    const _mockified_A = mockify(A);
    const _mockified_B = mockify(B);
    "#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    separate_export_declaration_with_rename,
    // Input codes
    r#"const A = () => {};
    function B() {}
    export { A as AA, B as BB };"#,
    // Output codes after transformed with plugin (assuming A and B are transformed)
    r#"import { mockify as mockify } from "mockify";
    const A = () => {};
    function B() {}
    export { _mockified_A as AA, _mockified_B as BB };
    const _mockified_A = mockify(A);
    const _mockified_B = mockify(B);
    "#
);
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    export_imported_values,
    // Input codes
    r#"import { A } from 'module';
    export { A as ABC };"#,
    // Output codes
    r#"import { mockify as mockify } from "mockify";
    import { A } from 'module';
    export { _mockified_A as ABC };
    const _mockified_A = mockify(A);
    "#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    complex_object_exports,
    // Input codes
    r#"export const nested = { example: {} };"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export const nested = mockify({ example: {} });"#
);

// Do not add imports if mockify is not used
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    no_added_imports,
    // Input codes
    r#"class Example {}"#,
    // Output codes after transformed with plugin
    r#"class Example {}"#
);

// Does not change code if __do_not_mockify__ is used
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    do_not_mockify,
    // Input codes
    r#""__do_not_mockify__";
    export const example = {};"#,
    // Output codes after transformed with plugin
    r#""__do_not_mockify__";
    export const example = {};"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    mixed_exports,
    // Input codes
    r#"export default function() {}
    export const name = {};"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    export default mockify(function() {});
    export const name = mockify({});"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    async_function,
    // Input codes
    r#"export async function asyncFunc() { return Promise.resolve(); }"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    async function asyncFunc() { return Promise.resolve(); }
    const _mockified_asyncFunc = mockify(asyncFunc);
    export { _mockified_asyncFunc as asyncFunc };"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    generator_function,
    // Input codes
    r#"export function* genFunc() { yield 1; }"#,
    // Output codes after transformed with plugin
    r#"import { mockify as mockify } from "mockify";
    function* genFunc() { yield 1; }
    const _mockified_genFunc = mockify(genFunc);
    export { _mockified_genFunc as genFunc };"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    dynamic_import,
    // Input codes
    r#"const module = import('./module');"#,
    // Output codes after transformed with plugin (assuming no transformation)
    r#"const module = import('./module');"#
);

test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(None)),
    re_export,
    // Input codes
    r#"export { example } from 'another-module';"#,
    // Output codes after transformed with plugin (assuming no transformation)
    r#"export { example } from 'another-module';"#
);

// Testing exported const
test!(
    Default::default(),
    |_| as_folder(TransformVisitor::new(Some(Config {
        import_from: "custom-mockify".into(),
        base_path: ".".into(),
        export_name: "customMockify".into(),
        import_as: "___customMockify".into(),
        exclude_paths: None,
        include_paths: None,
    }))),
    custom_config,
    // Input codes
    r#"export const example = {};"#,
    // Output codes after transformed with plugin
    r#"import { customMockify as ___customMockify } from "custom-mockify";
    export const example = ___customMockify({});"#
);

// ------- //

/**
 * below code is taken from https://github.com/jantimon/css-variable/blob/main/swc/swc-plugin-css-variable/src/lib.rs
 * The MIT License (MIT)
 * Copyright (c) Jan Nicklas <j.nicklas@me.com>
 */

/// Returns a relative POSIX path from the `base_path` to the filename.
///
/// For example:
/// - "/foo/", "/bar/baz.txt" -> "../bar/baz.txt"
/// - "C:\foo\", "C:\foo\baz.txt" -> "../bar/baz.txt"
///
/// The format of `base_path` and `filename` must match the current OS.
fn relative_posix_path(base_path: &str, filename: &str) -> String {
    let normalized_base_path = convert_path_to_posix(base_path);
    let normalized_filename = convert_path_to_posix(filename);
    let relative_filename = diff_paths(normalized_filename, normalized_base_path)
        .expect("Could not create relative path");
    let path_parts = relative_filename
        .components()
        .map(|component| component.as_os_str().to_str().unwrap())
        .collect::<Vec<&str>>();

    path_parts.join("/")
}

/// Returns the path converted to a POSIX path (naive approach).
///
/// For example:
/// - "C:\foo\bar" -> "c/foo/bar"
/// - "/foo/bar" -> "/foo/bar"
fn convert_path_to_posix(path: &str) -> String {
    lazy_static! {
        static ref PATH_REPLACEMENT_REGEX: Regex = Regex::new(r":\\|\\").unwrap();
    }

    PATH_REPLACEMENT_REGEX.replace_all(path, "/").to_string()
}
