pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    timestamps()
  }

  triggers {
    pollSCM('H/1 * * * *')
  }

  environment {
    KUBECONFIG = '/var/lib/jenkins/.kube/config'
    K8S_NAMESPACE = 'ais-gateway'
    DEPLOY_ROOT = '/var/lib/ais-gateway-admin'
  }

  stages {
    stage('Build in Kubernetes') {
      steps {
        script {
          def jobName = "frontend-build-${env.BUILD_NUMBER}"
          def workspacePath = env.WORKSPACE.replace('\\', '/')
          def jenkinsUid = sh(script: 'id -u', returnStdout: true).trim()
          def jenkinsGid = sh(script: 'id -g', returnStdout: true).trim()
          def template = readFile('deploy/k8s/build-job.yaml')
          def manifest = template
            .replace('__BUILD_NUMBER__', env.BUILD_NUMBER)
            .replace('__JENKINS_UID__', jenkinsUid)
            .replace('__JENKINS_GID__', jenkinsGid)
            .replace('__WORKSPACE__', workspacePath)
          writeFile(file: 'build-job.generated.yaml', text: manifest)

          sh "kubectl apply -f build-job.generated.yaml"
          try {
            sh "kubectl wait --namespace ${K8S_NAMESPACE} --for=condition=complete job/${jobName} --timeout=20m"
          } catch (err) {
            sh "kubectl logs --namespace ${K8S_NAMESPACE} job/${jobName} || true"
            throw err
          }
          sh "kubectl logs --namespace ${K8S_NAMESPACE} job/${jobName}"
        }
      }
    }

    stage('Publish to Kubernetes') {
      steps {
        sh '''
          set -eu
          mkdir -p "$DEPLOY_ROOT/releases"
          rm -f "$DEPLOY_ROOT/current.next"
          ln -s "releases/$BUILD_NUMBER/site" "$DEPLOY_ROOT/current.next"
          mv -Tf "$DEPLOY_ROOT/current.next" "$DEPLOY_ROOT/current"
          kubectl rollout restart deployment/frontend --namespace "$K8S_NAMESPACE"
          kubectl rollout status deployment/frontend --namespace "$K8S_NAMESPACE" --timeout=120s
        '''
      }
    }
  }

  post {
    always {
      script {
        sh "kubectl delete job frontend-build-${env.BUILD_NUMBER} --namespace ${K8S_NAMESPACE} --ignore-not-found=true"
      }
    }
  }
}
