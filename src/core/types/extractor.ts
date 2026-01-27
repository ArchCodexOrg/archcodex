/**
 * @arch archcodex.infra
 * @intent:ast-analysis
 *
 * Type extractor for extracting full type definitions from TypeScript files.
 * Uses ts-morph for AST analysis.
 */
import { Project, InterfaceDeclaration, TypeAliasDeclaration, EnumDeclaration, ClassDeclaration, SyntaxKind } from 'ts-morph';
import type { TypeInfo, PropertyInfo, MethodSignature, TypeStructure } from './types.js';

/**
 * Type extractor for analyzing TypeScript type definitions.
 */
export class TypeExtractor {
  private project: Project;

  constructor() {
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      skipFileDependencyResolution: true,
    });
  }

  /**
   * Extract all type definitions from a file.
   */
  extractFromFile(filePath: string, content: string): TypeInfo[] {
    const types: TypeInfo[] = [];

    try {
      const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });

      // Extract interfaces
      for (const iface of sourceFile.getInterfaces()) {
        types.push(this.extractInterface(iface, filePath));
      }

      // Extract type aliases (only object-like types)
      for (const typeAlias of sourceFile.getTypeAliases()) {
        const typeInfo = this.extractTypeAlias(typeAlias, filePath);
        if (typeInfo) {
          types.push(typeInfo);
        }
      }

      // Extract enums
      for (const enumDecl of sourceFile.getEnums()) {
        types.push(this.extractEnum(enumDecl, filePath));
      }

      // Extract classes (for their type shapes)
      for (const classDecl of sourceFile.getClasses()) {
        types.push(this.extractClass(classDecl, filePath));
      }

      // Pre-compute cached fields for each type (avoids recomputation in O(n²) loops)
      for (const type of types) {
        type._cachedStructure = TypeExtractor.createStructure(type);
        type._propertyNames = new Set(type.properties.map(p => p.name));
        type._methodNames = new Set(type.methods.map(m => m.name));
      }

      return types;
    } finally {
      // Defer cleanup to dispose() for better batch performance
      // Individual file cleanup was causing overhead
    }
  }

  /**
   * Extract interface information.
   */
  private extractInterface(iface: InterfaceDeclaration, filePath: string): TypeInfo {
    const properties: PropertyInfo[] = [];
    const methods: MethodSignature[] = [];

    // Extract properties
    for (const prop of iface.getProperties()) {
      properties.push({
        name: prop.getName(),
        type: prop.getType().getText(prop) || 'unknown',
        optional: prop.hasQuestionToken(),
        readonly: prop.isReadonly(),
      });
    }

    // Extract methods
    for (const method of iface.getMethods()) {
      methods.push({
        name: method.getName(),
        parameters: method.getParameters().map(p => ({
          name: p.getName(),
          type: p.getType().getText(p) || 'unknown',
          optional: p.hasQuestionToken(),
        })),
        returnType: method.getReturnType().getText(method) || 'void',
      });
    }

    // Get extended interfaces
    const extendsClause = iface.getExtends().map(e => e.getText());

    // Get generic parameters
    const generics = iface.getTypeParameters().map(tp => tp.getText());

    return {
      name: iface.getName(),
      kind: 'interface',
      properties,
      methods,
      extends: extendsClause.length > 0 ? extendsClause : undefined,
      generics: generics.length > 0 ? generics : undefined,
      file: filePath,
      line: iface.getStartLineNumber(),
      isExported: iface.isExported(),
      location: {
        line: iface.getStartLineNumber(),
        column: iface.getStart() - iface.getStartLinePos() + 1,
      },
    };
  }

  /**
   * Extract type alias information (only object-like types).
   */
  private extractTypeAlias(typeAlias: TypeAliasDeclaration, filePath: string): TypeInfo | null {
    const typeNode = typeAlias.getTypeNode();
    if (!typeNode) return null;

    // Only extract object-like type aliases
    if (typeNode.getKind() !== SyntaxKind.TypeLiteral) {
      return null;
    }

    const properties: PropertyInfo[] = [];
    const methods: MethodSignature[] = [];

    // Extract from type literal
    for (const member of typeNode.getDescendantsOfKind(SyntaxKind.PropertySignature)) {
      properties.push({
        name: member.getName(),
        type: member.getType().getText(member) || 'unknown',
        optional: member.hasQuestionToken(),
        readonly: member.isReadonly(),
      });
    }

    for (const method of typeNode.getDescendantsOfKind(SyntaxKind.MethodSignature)) {
      methods.push({
        name: method.getName(),
        parameters: method.getParameters().map(p => ({
          name: p.getName(),
          type: p.getType().getText(p) || 'unknown',
          optional: p.hasQuestionToken(),
        })),
        returnType: method.getReturnType().getText(method) || 'void',
      });
    }

    // Get generic parameters
    const generics = typeAlias.getTypeParameters().map(tp => tp.getText());

    return {
      name: typeAlias.getName(),
      kind: 'type',
      properties,
      methods,
      generics: generics.length > 0 ? generics : undefined,
      file: filePath,
      line: typeAlias.getStartLineNumber(),
      isExported: typeAlias.isExported(),
      location: {
        line: typeAlias.getStartLineNumber(),
        column: typeAlias.getStart() - typeAlias.getStartLinePos() + 1,
      },
    };
  }

  /**
   * Extract enum information.
   */
  private extractEnum(enumDecl: EnumDeclaration, filePath: string): TypeInfo {
    const properties: PropertyInfo[] = [];

    for (const member of enumDecl.getMembers()) {
      properties.push({
        name: member.getName(),
        type: 'enum-member',
        optional: false,
        readonly: true,
      });
    }

    return {
      name: enumDecl.getName(),
      kind: 'enum',
      properties,
      methods: [],
      file: filePath,
      line: enumDecl.getStartLineNumber(),
      isExported: enumDecl.isExported(),
      location: {
        line: enumDecl.getStartLineNumber(),
        column: enumDecl.getStart() - enumDecl.getStartLinePos() + 1,
      },
    };
  }

  /**
   * Extract class type shape.
   */
  private extractClass(classDecl: ClassDeclaration, filePath: string): TypeInfo {
    const properties: PropertyInfo[] = [];
    const methods: MethodSignature[] = [];

    // Extract properties
    for (const prop of classDecl.getProperties()) {
      if (prop.getScope() === 'public' || !prop.getScope()) {
        properties.push({
          name: prop.getName(),
          type: prop.getType().getText(prop) || 'unknown',
          optional: prop.hasQuestionToken(),
          readonly: prop.isReadonly(),
        });
      }
    }

    // Extract public methods
    for (const method of classDecl.getMethods()) {
      if (method.getScope() === 'public' || !method.getScope()) {
        methods.push({
          name: method.getName(),
          parameters: method.getParameters().map(p => ({
            name: p.getName(),
            type: p.getType().getText(p) || 'unknown',
            optional: p.hasQuestionToken(),
          })),
          returnType: method.getReturnType().getText(method) || 'void',
        });
      }
    }

    // Get extended class
    const extendsClause = classDecl.getExtends()?.getText();

    // Get implemented interfaces
    const implementsClause = classDecl.getImplements().map(i => i.getText());

    // Get generic parameters
    const generics = classDecl.getTypeParameters().map(tp => tp.getText());

    return {
      name: classDecl.getName() || 'AnonymousClass',
      kind: 'class',
      properties,
      methods,
      extends: extendsClause ? [extendsClause, ...implementsClause] : (implementsClause.length > 0 ? implementsClause : undefined),
      generics: generics.length > 0 ? generics : undefined,
      file: filePath,
      line: classDecl.getStartLineNumber(),
      isExported: classDecl.isExported(),
      location: {
        line: classDecl.getStartLineNumber(),
        column: classDecl.getStart() - classDecl.getStartLinePos() + 1,
      },
    };
  }

  /**
   * Create a structural signature for comparison.
   */
  static createStructure(type: TypeInfo): TypeStructure {
    // Sort properties alphabetically and create signature
    const sortedProps = [...type.properties].sort((a, b) => a.name.localeCompare(b.name));
    const propertySignature = sortedProps
      .map(p => `${p.name}${p.optional ? '?' : ''}:${p.type}`)
      .join(';');

    // Sort methods and create signature
    const sortedMethods = [...type.methods].sort((a, b) => a.name.localeCompare(b.name));
    const methodSignature = sortedMethods
      .map(m => `${m.name}(${m.parameters.map(p => `${p.name}:${p.type}`).join(',')}):${m.returnType}`)
      .join(';');

    return {
      propertySignature,
      methodSignature,
      propertyCount: type.properties.length,
      methodCount: type.methods.length,
    };
  }

  /**
   * Calculate similarity between two types (0-1).
   * Uses cached sets when available for better performance.
   */
  static calculateSimilarity(type1: TypeInfo, type2: TypeInfo): number {
    // Use cached sets if available, otherwise create them
    const props1 = type1._propertyNames ?? new Set(type1.properties.map(p => p.name));
    const props2 = type2._propertyNames ?? new Set(type2.properties.map(p => p.name));

    const methods1 = type1._methodNames ?? new Set(type1.methods.map(m => m.name));
    const methods2 = type2._methodNames ?? new Set(type2.methods.map(m => m.name));

    // Calculate Jaccard similarity for properties (without creating intermediate Sets)
    const propIntersection = [...props1].filter(p => props2.has(p)).length;
    const propUnion = props1.size + props2.size - propIntersection;
    const propSimilarity = propUnion > 0 ? propIntersection / propUnion : 1;

    // Calculate Jaccard similarity for methods
    const methodIntersection = [...methods1].filter(m => methods2.has(m)).length;
    const methodUnion = methods1.size + methods2.size - methodIntersection;
    const methodSimilarity = methodUnion > 0 ? methodIntersection / methodUnion : 1;

    // Weight properties more than methods for type comparison
    return propSimilarity * 0.7 + methodSimilarity * 0.3;
  }

  /**
   * Dispose of ts-morph resources.
   */
  dispose(): void {
    // Clear all source files
    for (const sf of this.project.getSourceFiles()) {
      this.project.removeSourceFile(sf);
    }
  }
}
