# CI/CD Layer

This repository includes CI/CD definitions for three common platforms:

- GitHub Actions: `.github/workflows/secure-gateway-ci-cd.yml`
- GitLab CI: `.gitlab-ci.yml`
- Jenkins: `Jenkinsfile`

The shared security scanner configuration is `.trivy.yaml`.

## Pipeline Stages

```text
Source Code
  -> Install backend dependencies
  -> JavaScript syntax check
  -> npm dependency audit
  -> Docker Compose config validation
  -> Trivy filesystem scan
  -> Docker image build
  -> Trivy container image scan
  -> Kubernetes deployment, manual or secret-gated
```

## Security Gates

The pipeline fails on:

- JavaScript syntax errors.
- High or critical npm audit findings.
- High or critical Trivy findings in filesystem or container image scans.
- Invalid Docker Compose configuration.
- Failed Kubernetes rollout when deployment is enabled.

## Deployment

Deployment is intentionally gated:

- GitHub Actions deploys only on manual `workflow_dispatch` and only when the `KUBECONFIG_B64` secret is configured.
- GitLab CI deploys manually on the `main` branch when `KUBECONFIG_B64` is configured.
- Jenkins deploys on the `main` branch when `KUBECONFIG_B64` exists in the environment.

`KUBECONFIG_B64` should contain a base64-encoded kubeconfig file.
