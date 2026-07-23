pipeline {
    agent any
    
    tools {
        nodejs 'nodejs22'
    }

    environment {
        APP_NAME      = 'summitodoro'
        NAMESPACE     = 'summitodoro'
        SOURCE_REPO   = 'https://github.com/Louienismal4/Summitodoro-k8s.git'
        IMAGE_REPO    = 'ghcr.io/louienismal4/summitodoro'
        SCANNER_HOME  = tool 'sonar-scanner'
    }

    options {
        skipDefaultCheckout(true)
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
        timeout(time: 40, unit: 'MINUTES')
    }

    stages {
        stage('Checkout Application') {
            steps {
                checkout scm
            }
        }

        stage('Set Image Tag') {
            steps {
                script {
                    env.SHORT_COMMIT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()

                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${env.SHORT_COMMIT}"
                    env.IMAGE = "${env.IMAGE_REPO}:${env.IMAGE_TAG}"
                }

                echo "Building image: ${env.IMAGE}"
            }
        }

        stage('Verify Tools') {
            steps {
                sh '''
                    set -eu

                    echo "Node:"
                    node --version

                    echo "npm:"
                    npm --version

                    echo "Git:"
                    git --version

                    echo "Docker:"
                    docker --version

                    echo "Trivy:"
                    trivy --version

                    echo "kubectl:"
                    kubectl version --client
                '''
            }
        }

        stage('Install Dependencies') {
            steps {
                sh 'npm ci'
            }
        }

        stage('Format Check') {
            steps {
                sh 'npm run format:check --if-present'
            }
        }

        stage('Lint') {
            steps {
                sh 'npm run lint'
            }
        }

        stage('Type Check') {
            steps {
                sh 'npm run typecheck --if-present'
            }
        }

        stage('Test') {
            steps {
                sh 'npm run test --if-present -- --run'
            }
        }

        stage('Build Application') {
            steps {
                sh 'npm run build'
            }
        }

        stage('File System Scan') {
            steps {
                sh '''
                    trivy fs \
                        --scanners vuln,secret,misconfig \
                        --severity HIGH,CRITICAL \
                        --exit-code 1 \
                        --format table \
                        --output trivy-fs-report.txt \
                        .
                '''
            }
        }

        stage('SonarQube Analysis') {
            steps {
                withSonarQubeEnv('sonar') {
                    sh '''
                        "$SCANNER_HOME/bin/sonar-scanner" \
                            -Dsonar.projectKey=summitodoro-k8s \
                            -Dsonar.projectName=Summitodoro-k8s \
                            -Dsonar.sources=. \
                            -Dsonar.sourceEncoding=UTF-8 \
                            -Dsonar.exclusions="node_modules/**,.next/**,dist/**,coverage/**,playwright-report/**,test-results/**,infra/**,k8s/**"
                    '''
                }
            }
        }

        stage('Quality Gate') {
            steps {
                timeout(time: 10, unit: 'MINUTES') {
                    waitForQualityGate(
                        abortPipeline: true,
                        credentialsId: 'sonar-token'
                    )
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                sh '''
                    set -eu
                    
                    docker build \
                        --tag "$IMAGE" \
                        --no-cache \
                        --pull \
                        .
                '''
            }
        }

        stage('Docker Image Scan') {
            steps {
                sh '''
                    trivy image \
                        --severity HIGH,CRITICAL \
                        --ignore-unfixed \
                        --exit-code 1 \
                        --format table \
                        --output trivy-image-report.txt \
                        "$IMAGE"
                '''
            }
        }

        stage('Push Docker Image') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'ghcr-credentials',
                        usernameVariable: 'GHCR_USERNAME',
                        passwordVariable: 'GHCR_TOKEN'
                    )
                ]) {
                    sh '''
                        echo "$GHCR_TOKEN" |
                            docker login ghcr.io \
                                --username "$GHCR_USERNAME" \
                                --password-stdin

                        docker push "$IMAGE"
                    '''
                }
            }
        }

        stage('Deploy To Kubernetes') {
            steps {
                withKubeConfig([
                    credentialsId: 'k8-cred',
                    namespace: "${NAMESPACE}",
                    restrictKubeConfigAccess: true
                ]) {
                    sh '''
                        kubectl apply \
                            --filename k8s/deployment.yaml \
                            --filename k8s/service.yaml \
                            --namespace "$NAMESPACE"

                        kubectl set image \
                            deployment/summitodoro \
                            summitodoro="$IMAGE" \
                            --namespace "$NAMESPACE"

                        kubectl rollout status \
                            deployment/summitodoro \
                            --namespace "$NAMESPACE" \
                            --timeout=180s
                    '''
                }
            }
        }

        stage('Verify Deployment') {
            steps {
                withKubeConfig([
                    credentialsId: 'k8-cred',
                    namespace: "${NAMESPACE}",
                    restrictKubeConfigAccess: true
                ]) {
                    sh '''
                        kubectl get deployment \
                            --namespace "$NAMESPACE" \
                            --output wide

                        kubectl get pods \
                            --namespace "$NAMESPACE" \
                            --output wide

                        kubectl get services \
                            --namespace "$NAMESPACE"
                    '''
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts(
                artifacts: 'trivy-*.txt',
                allowEmptyArchive: true
            )

            sh 'docker logout ghcr.io || true'
        }

        success {
            echo "Summitodoro deployed successfully: ${env.IMAGE}"
        }

        failure {
            echo 'Summitodoro pipeline failed. Check the first failed stage.'
        }

        cleanup {
            cleanWs()
        }
    }
}