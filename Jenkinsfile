pipeline {
  agent any

  environment {
    IMAGE_NAME = 'secure-api-gateway'
  }

  stages {
    stage('Install') {
      steps {
        dir('backend') {
          sh 'npm ci'
        }
      }
    }

    stage('Validate') {
      steps {
        dir('backend') {
          sh 'npm run check:syntax'
          sh 'npm audit --audit-level=high'
        }
        sh 'docker compose config'
      }
    }

    stage('Trivy Filesystem Scan') {
      steps {
        sh 'trivy fs --config .trivy.yaml --format table --exit-code 1 .'
      }
    }

    stage('Build Backend Image') {
      steps {
        sh 'docker build -t ${IMAGE_NAME}:${BUILD_NUMBER} ./backend'
      }
    }

    stage('Trivy Image Scan') {
      steps {
        sh 'trivy image --config .trivy.yaml --format table --exit-code 1 ${IMAGE_NAME}:${BUILD_NUMBER}'
      }
    }

    stage('Deploy Kubernetes') {
      when {
        allOf {
          branch 'main'
          expression { return env.KUBECONFIG_B64?.trim() }
        }
      }
      steps {
        sh '''
          mkdir -p "$HOME/.kube"
          echo "$KUBECONFIG_B64" | base64 -d > "$HOME/.kube/config"
          kubectl apply -f k8s/namespace.yml
          kubectl apply -f k8s/postgres.yml
          kubectl apply -f k8s/keycloak.yml
          kubectl apply -f k8s/backend.yml
          kubectl apply -f k8s/kong.yml
          kubectl rollout status deployment/backend -n api-gateway --timeout=120s
          kubectl rollout status deployment/kong -n api-gateway --timeout=120s
        '''
      }
    }
  }

  post {
    always {
      echo 'CI/CD pipeline finished.'
    }
  }
}
