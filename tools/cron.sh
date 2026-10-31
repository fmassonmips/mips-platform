#!/usr/bin/env bash
# Runs one scheduled job and records how it ended, for the watchdog and
# /health.php (App\Ops\Health). Every crontab line goes through it:
#   */5 * * * *  /var/www/mips/tools/cron.sh mra_retry php /var/www/mips/tools/mra_retry.php >> /var/log/mips/cron.log 2>&1
# Output lines are prefixed with the date and the job name. Exits with the job's code.
set -u
job=${1:?usage: cron.sh <job> <command> [args...]}
shift
root=$(cd "$(dirname "$0")/.." && pwd)
"$@" 2>&1 | while IFS= read -r line; do printf '%s [%s] %s\n' "$(date '+%F %T')" "$job" "$line"; done
code=${PIPESTATUS[0]}
php "$root/tools/ops.php" record "$job" "$code" || echo "$(date '+%F %T') [$job] could not record the result (exit $code)"
exit "$code"
