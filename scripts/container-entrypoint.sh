#!/bin/sh
set -eu

runtime_data_dir="${STOCK_RUNTIME_DATA_DIR:-/app/data}"
backup_dir="${STOCK_BACKUP_DIR:-${runtime_data_dir}/backups}"

mkdir -p "${runtime_data_dir}" "${backup_dir}"
chown -R nextjs:nodejs "${runtime_data_dir}" "${backup_dir}"

exec gosu nextjs "$@"
