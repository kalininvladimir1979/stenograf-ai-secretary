export type ReleaseMode = 'standard' | 'economy';
export function releaseMode(value: unknown): ReleaseMode {
  if (value === undefined || value === 'standard') return 'standard';
  if (value === 'economy') return value;
  throw new Error('Выберите обычную публикацию или режим экономии места.');
}

// Runs inside the verified release SSH session. Only this Compose project's
// application services and the exact image IDs they used are eligible.
export function prepareMaintenance(mode: ReleaseMode): string {
  return [
    'old_app_images=""',
    'if [ -f "$install/deploy/compose.production.yml" ] && [ -s "$install/.env" ]; then',
    '  old_app_images=$(docker compose --env-file "$install/.env" -f "$install/deploy/compose.production.yml" -p "$project" images -q api web | sort -u)',
    ...(mode === 'economy' ? [
      '  echo RELEASE_MAINTENANCE=stopping_application',
      '  docker compose --env-file "$install/.env" -f "$install/deploy/compose.production.yml" -p "$project" stop web api',
      '  docker compose --env-file "$install/.env" -f "$install/deploy/compose.production.yml" -p "$project" rm -f web api',
      removeUnusedApplicationImages(),
      '  echo RELEASE_MAINTENANCE=old_application_removed',
    ] : []),
    'fi',
  ].join('\n');
}

function removeUnusedApplicationImages(): string {
  return [
    'for image in $old_app_images; do',
    '  image=${image#sha256:}',
    '  case "$image" in *[!a-f0-9:]*|"") echo RELEASE_ERROR=invalid_image_id; exit 45;; esac',
    // Include stopped containers: images referenced by any other container stay.
    '  if [ -z "$(docker ps -aq --filter "ancestor=$image")" ]; then',
    '    if ! docker image rm "$image"; then echo RELEASE_WARNING=image_retained_shared_or_cached; fi',
    '  else echo RELEASE_WARNING=image_retained_in_use; fi',
    'done',
  ].join('\n');
}

// Called only after both local and public health checks pass. Pattern matching
// is restricted to generated release backups, never arbitrary files or volumes.
export function finishMaintenance(retainBackups=true): string {
  return [
    removeUnusedApplicationImages(),
    ...(retainBackups ? [
    'python3 - "$install/.release" "$rollback_archive" <<\'RELEASE_RETENTION\'',
    'import pathlib,re,sys',
    'root=pathlib.Path(sys.argv[1]).resolve(); keep=pathlib.Path(sys.argv[2]).resolve() if sys.argv[2] else None',
    'if keep: assert keep.parent==root and keep.is_file(), "Verified rollback archive is missing; retention cancelled"',
    'code=[]; database=[]',
    'for file in root.iterdir():',
    ' if file.is_symlink() or not file.is_file(): continue',
    ' if re.fullmatch(r"before-[0-9]{14}\\.tgz",file.name): code.append(file)',
    ' if re.fullmatch(r"database-before-[0-9]{14}\\.sql(?:\\.gz)?",file.name): database.append(file)',
    'for file in code:',
    ' if keep and file.resolve()!=keep: file.unlink()',
    'for file in sorted(database,key=lambda f:f.name,reverse=True)[2:]: file.unlink()',
    'print("RELEASE_RETENTION=one_code_archive_two_database_dumps")',
    'RELEASE_RETENTION',
    ] : ['echo RELEASE_RETENTION=preserved_without_confirmation']),
  ].join('\n');
}
