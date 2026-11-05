#!/usr/bin/env bash
set -euo pipefail

JENKINS_HOME=/var/lib/jenkins
JOB_DIR="$JENKINS_HOME/jobs/ais-gateway-admin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo '请使用 root 执行' >&2; exit 1; }
[ -s "$PROJECT_DIR/Jenkinsfile" ] || { echo '未找到仓库根目录 Jenkinsfile' >&2; exit 1; }

install -d -o jenkins -g jenkins -m 0750 "$JOB_DIR"
python - "$PROJECT_DIR/Jenkinsfile" "$JOB_DIR/config.xml" <<'PY'
import sys

from xml.sax.saxutils import escape

pipeline = open(sys.argv[1], 'r').read()
template = '''<?xml version='1.1' encoding='UTF-8'?>
<org.jenkinsci.plugins.workflow.job.WorkflowJob plugin="workflow-job">
  <actions/>
  <description>Poll GitHub main every five minutes and build and release through Kubernetes.</description>
  <keepDependencies>false</keepDependencies>
  <properties/>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps">
    <script>__PIPELINE_SCRIPT__</script>
    <sandbox>true</sandbox>
  </definition>
  <triggers>
    <hudson.triggers.TimerTrigger>
      <spec>H/5 * * * *</spec>
    </hudson.triggers.TimerTrigger>
  </triggers>
  <disabled>false</disabled>
</org.jenkinsci.plugins.workflow.job.WorkflowJob>
'''
open(sys.argv[2], 'w').write(template.replace('__PIPELINE_SCRIPT__', escape(pipeline)))
PY
chown jenkins:jenkins "$JOB_DIR/config.xml"
chmod 0640 "$JOB_DIR/config.xml"
systemctl restart jenkins
for attempt in $(seq 1 60); do
  if systemctl is-active --quiet jenkins && curl -fsS http://127.0.0.1:8080/jenkins/login >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
systemctl is-active jenkins
echo 'Jenkins pipeline configured with five-minute GitHub commit polling.'
