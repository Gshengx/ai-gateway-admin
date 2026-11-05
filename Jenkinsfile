pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  triggers {
    cron('H/5 * * * *')
  }

  environment {
    KUBECONFIG = '/var/lib/jenkins/.kube/config'
    K8S_NAMESPACE = 'ais-gateway'
    DEPLOY_ROOT = '/var/lib/ais-gateway-admin'
    SKIP_BUILD = 'false'
  }

  stages {
    stage('Check GitHub main') {
      steps {
        script {
          def sourceSha = sh(
            script: '''
              set -eu
              curl -4 -fsSL --retry 3 --retry-delay 2 --connect-timeout 15 --max-time 60 \
                https://api.github.com/repos/Gshengx/ai-gateway-admin/commits/main \
                | python -c 'import json,sys; print(json.load(sys.stdin)["sha"])'
            ''',
            returnStdout: true
          ).trim()
          if (!(sourceSha ==~ /[0-9a-f]{40}/)) {
            error("GitHub returned an invalid main commit: ${sourceSha}")
          }
          env.SOURCE_SHA = sourceSha

          def deployedSha = sh(
            script: 'cat "$DEPLOY_ROOT/.last-deployed-sha" 2>/dev/null || true',
            returnStdout: true
          ).trim()
          if (deployedSha == env.SOURCE_SHA) {
            env.SKIP_BUILD = 'true'
            currentBuild.description = "No new commit (${sourceSha.take(7)})"
          }
        }
      }
    }

    stage('Download source') {
      when {
        expression { env.SKIP_BUILD != 'true' }
      }
      steps {
        sh '''
          set -eu
          rm -rf repo source.tar.gz
          curl -4 -fL --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 300 \
            "https://codeload.github.com/Gshengx/ai-gateway-admin/tar.gz/${SOURCE_SHA}" \
            -o source.tar.gz
          mkdir repo
          tar -xzf source.tar.gz --strip-components=1 -C repo
          test -f repo/deploy/k8s/build-job.yaml
        '''
      }
    }

    stage('Build in Kubernetes') {
      when {
        expression { env.SKIP_BUILD != 'true' }
      }
      steps {
        script {
          def jobName = "frontend-build-${env.BUILD_NUMBER}"
          def workspacePath = "${env.WORKSPACE}/repo".replace('\\', '/')
          def jenkinsUid = sh(script: 'id -u', returnStdout: true).trim()
          def jenkinsGid = sh(script: 'id -g', returnStdout: true).trim()
          def template = readFile('repo/deploy/k8s/build-job.yaml')
          def manifest = template
            .replace('__BUILD_NUMBER__', env.BUILD_NUMBER)
            .replace('__JENKINS_UID__', jenkinsUid)
            .replace('__JENKINS_GID__', jenkinsGid)
            .replace('__WORKSPACE__', workspacePath)
          writeFile(file: 'build-job.generated.yaml', text: manifest)

          sh 'kubectl apply -f build-job.generated.yaml'
          try {
            sh "kubectl wait --namespace ${K8S_NAMESPACE} --for=condition=complete job/${jobName} --timeout=30m"
          } catch (err) {
            sh "kubectl logs --namespace ${K8S_NAMESPACE} job/${jobName} || true"
            throw err
          }
          sh "kubectl logs --namespace ${K8S_NAMESPACE} job/${jobName}"
        }
      }
    }

    stage('Publish to Kubernetes') {
      when {
        expression { env.SKIP_BUILD != 'true' }
      }
      steps {
        sh '''
          set -eu
          mkdir -p "$DEPLOY_ROOT/releases"
          rm -f "$DEPLOY_ROOT/current.next"
          ln -s "releases/$BUILD_NUMBER/site" "$DEPLOY_ROOT/current.next"
          mv -Tf "$DEPLOY_ROOT/current.next" "$DEPLOY_ROOT/current"
          kubectl rollout restart deployment/frontend --namespace "$K8S_NAMESPACE"
          kubectl rollout status deployment/frontend --namespace "$K8S_NAMESPACE" --timeout=120s
          printf '%s\\n' "$SOURCE_SHA" > "$DEPLOY_ROOT/.last-deployed-sha.next"
          mv -f "$DEPLOY_ROOT/.last-deployed-sha.next" "$DEPLOY_ROOT/.last-deployed-sha"
        '''
      }
    }
  }

  post {
    always {
      sh "kubectl delete job frontend-build-${env.BUILD_NUMBER} --namespace ${K8S_NAMESPACE} --ignore-not-found=true"
    }
  }
}
