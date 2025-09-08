Here is a Rust plugin for SWC transpiler, that enables mocking of exports, by wrapping them with a call to mockify(realExport):

```rust
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
     if str_lit.value.eq("use __do_not_mockify__") {
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
```

The problem is that the in-file references to functions currently resolve to real function implementations, rather than their "mockified" version. This is because functions can be referenced anywhere in the file, and cannot simply be replaced by const exports like `export const fn = function()`.

To make the internal (in-file) references to functions reference the mockified version, we could modify the transform to do this instead:

```js
export function one() {
  /* content */
}
function two() {
  // should use the mocked version of one
  one();
}
```

after transform:

```js
function __mockify__real_one() {
  /* content */
}
const __mockified__one = mockify(__mockify__real_one);
export function one(...args) {
  return __mockified__one(...args);
}
// and then the two function would be unchanged
function two() {
  // should use the mocked version of one
  one();
}
```

So the transform steps are:

- rename real function to `__mockify__real_<name>`
- create a mockified version of the function as const
- export a function with the same name as the real function, which calls the mockified version

Write the code changes to the SWC plugin that are necessary to make the transform work as defined above.
