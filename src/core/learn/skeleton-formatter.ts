/**
 * @arch archcodex.core.domain
 *
 * Skeleton formatting utilities for YAML output and LLM prompts.
 */
import type { ProjectSkeleton, SkeletonYaml } from './types.js';

/**
 * Convert a ProjectSkeleton to a compact YAML-serializable format.
 */
export function skeletonToYaml(skeleton: ProjectSkeleton): SkeletonYaml {
  return {
    _comment: `Skeleton for: ${skeleton.rootPath}`,
    files: skeleton.totalFiles,
    directories: skeleton.directories.map(d => ({
      path: d.path,
      files: d.fileCount,
    })),
    modules: skeleton.modules.slice(0, 100).map(m => ({
      path: m.path,
      exports: m.exports,
      imports: m.imports,
      classes: m.classes?.map(c => ({
        name: c.name,
        methods: c.methods,
      })),
    })),
    import_clusters: skeleton.importClusters.map(c => ({
      name: c.name,
      pattern: c.pattern,
      imports_from: c.importsFrom,
      imported_by: c.importedBy,
    })),
    existing_tags: skeleton.existingTags.map(t => ({
      file: t.file,
      arch: t.archId,
    })),
  };
}

/**
 * Convert skeleton to YAML string for LLM prompt.
 */
export function formatSkeletonForPrompt(skeleton: ProjectSkeleton): string {
  const yaml = skeletonToYaml(skeleton);

  const lines: string[] = [
    `# ${yaml._comment}`,
    `files: ${yaml.files}`,
    '',
    'directories:',
  ];

  for (const dir of yaml.directories) {
    lines.push(`  - ${dir.path}  # ${dir.files} files`);
  }

  lines.push('', 'modules:');
  for (const mod of yaml.modules.slice(0, 50)) {
    lines.push(`  - path: ${mod.path}`);
    if (mod.exports.length > 0) {
      lines.push(`    exports: [${mod.exports.slice(0, 10).join(', ')}${mod.exports.length > 10 ? ', ...' : ''}]`);
    }
    if (mod.imports.length > 0) {
      lines.push(`    imports: [${mod.imports.slice(0, 5).join(', ')}${mod.imports.length > 5 ? ', ...' : ''}]`);
    }
    if (mod.classes && mod.classes.length > 0) {
      lines.push('    classes:');
      for (const cls of mod.classes.slice(0, 3)) {
        lines.push(`      - name: ${cls.name}`);
        if (cls.methods.length > 0) {
          lines.push(`        methods: [${cls.methods.slice(0, 5).join(', ')}]`);
        }
      }
    }
  }

  if (yaml.modules.length > 50) {
    lines.push(`  # ... and ${yaml.modules.length - 50} more modules`);
  }

  lines.push('', 'import_clusters:');
  for (const cluster of yaml.import_clusters) {
    lines.push(`  - name: "${cluster.name}"`);
    lines.push(`    pattern: ${cluster.pattern}`);
    if (cluster.imports_from.length > 0) {
      lines.push(`    imports_from: [${cluster.imports_from.join(', ')}]`);
    }
    if (cluster.imported_by.length > 0) {
      lines.push(`    imported_by: [${cluster.imported_by.join(', ')}]`);
    }
  }

  if (yaml.existing_tags.length > 0) {
    lines.push('', 'existing_tags:');
    for (const tag of yaml.existing_tags.slice(0, 20)) {
      lines.push(`  - file: ${tag.file}`);
      lines.push(`    arch: ${tag.arch}`);
    }
    if (yaml.existing_tags.length > 20) {
      lines.push(`  # ... and ${yaml.existing_tags.length - 20} more`);
    }
  }

  return lines.join('\n');
}
