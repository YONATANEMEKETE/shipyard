-- Functional unique index: case-insensitive, workspace-scoped label uniqueness
-- (data-model.md D6). Prisma cannot express functional indexes, so this ships
-- as raw SQL (same pattern as project_name_unique). Names are trimmed
-- server-side before persist; label delete physically removes the row (joins
-- cascade), so deleting frees the name for reuse automatically.
CREATE UNIQUE INDEX "label_name_unique"
  ON "label"("workspaceId", lower("name"));
