# cloud-native-final-project — 명지대 게시판

프론트엔드와 백엔드를 각각 별도 컨테이너·Deployment로 분리한 게시판 서비스.
GitHub Actions + ArgoCD로 CI/CD를, Prometheus/Grafana로 모니터링을 구성했다.
DB는 노드(myserver01)에 직접 설치한 PostgreSQL을 사용한다.

## 아키텍처

```
 Mac 브라우저 ── localhost:2000 ──(VirtualBox 포트포워딩)──▶ 10.0.2.20:80 (MetalLB IP)
                                                              │
                                                     ingress-nginx (Ingress)
                                             ┌────────────────┴────────────────┐
                                          /api/*                              /*
                                    Service: backend                  Service: frontend
                                Deployment: backend ×1            Deployment: frontend ×2
                                (Spring Boot 3.5, Java 21)          (nginx 정적 파일)
                                          │
                           Service: postgres (selector 없음)
                           Endpoints: 10.0.2.3:5432
                                          │
                        myserver01에 설치된 PostgreSQL (클러스터 밖)

 git push(main) ─▶ GitHub Actions ─▶ Docker Hub (이미지:커밋SHA)
                        └─▶ k8s/*.yaml 이미지 태그 갱신 커밋 ─▶ ArgoCD 감지 ─▶ 자동 배포

 Prometheus ── ServiceMonitor ──▶ backend /actuator/prometheus ─▶ Grafana 대시보드
```

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `backend/` | Spring Boot API (`/api/posts` CRUD), Actuator(`/actuator/health/*`, `/actuator/prometheus`), Gradle, 멀티스테이지 Dockerfile |
| `frontend/` | HTML/JS/CSS 정적 페이지 + nginx 설정, Dockerfile |
| `k8s/` | **ArgoCD가 감시하는 폴더.** Namespace, DB 설정, 외부 DB Service, Deployment·Service, Ingress, ServiceMonitor |
| `argocd/application.yaml` | ArgoCD Application (UI 대신 kubectl로 만들 때) |
| `.github/workflows/ci.yaml` | main push 시 빌드 → Docker Hub push → 매니페스트 태그 갱신 |
| `grafana/board-dashboard.json` | Grafana에 import할 게시판 전용 대시보드 |
| `local-test/` | K8s에 올리기 전 docker compose로 확인하는 용도 |

## API

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/posts` | 목록 조회 (최신순) |
| GET | `/api/posts/{id}` | 단건 조회 |
| POST | `/api/posts` | 작성 `{"title","content","author"}` |
| PUT | `/api/posts/{id}` | 수정 (보낸 필드만) |
| DELETE | `/api/posts/{id}` | 삭제 |

테이블(`posts`)은 백엔드가 처음 뜰 때 JPA가 자동으로 만든다 (`ddl-auto: update`).
에러 응답은 `{"error": "메시지"}` 형식, JSON 필드는 `created_at`처럼 snake_case다.

헬스체크·메트릭 (K8s와 Prometheus가 사용, Ingress로는 노출하지 않음):

| 경로 | 용도 |
|---|---|
| `/actuator/health/liveness` | startupProbe, livenessProbe |
| `/actuator/health/readiness` | readinessProbe (DB 연결 포함) |
| `/actuator/prometheus` | Prometheus 수집 |
| `/actuator/info` | 떠 있는 버전 확인 (`APP_VERSION`) |

---

## 실행 순서

### 0. 사전 확인 (수업 실습에서 설치한 것)

```bash
kubectl get nodes                                   # myserver01~03 Ready
kubectl get svc -A | grep LoadBalancer              # ingress-nginx 컨트롤러 EXTERNAL-IP 확인 (10.0.2.20 예상)
kubectl get pods -n myargocd                        # ArgoCD (11주차, 네임스페이스 myargocd)
kubectl get pods -n monitoring                      # kube-prometheus-stack (12주차, 네임스페이스는 본인이 만든 이름)
kubectl get ingressclass                            # 이름이 nginx 인지 확인
```

- 확인된 값: ingress-nginx(`mynginx`) = 10.0.2.20 → 게시판은 Mac에서 `localhost:2000`, ArgoCD(`myargocd`) = 10.0.2.21 → ArgoCD 화면은 `localhost:2001`
- IngressClass 이름이 `nginx`가 아니면 `k8s/30-ingress.yaml`의 `ingressClassName`을 바꾼다.

### 1. PostgreSQL이 클러스터에서 접속 가능하게 설정 (myserver01)

1. PostgreSQL이 설치된 노드 IP를 확인하고(`ip addr`), 10.0.2.3이 아니면 `k8s/02-postgres-external.yaml`의 IP를 고친다.
2. `postgresql.conf`에 `listen_addresses = '*'`가 설정되어 있는지 확인한다 (10주차에서 설정함).
3. `pg_hba.conf`에 노드 대역과 파드 대역(Calico)을 허용한다.
   ```
   host  all  all  10.0.2.0/24     md5
   host  all  all  192.168.0.0/16  md5
   ```
4. `sudo systemctl restart postgresql`
5. 클러스터 안에서 접속 테스트 (2단계 이후에 가능):
   ```bash
   kubectl run pgtest -n board --rm -it --image=postgres:16 --restart=Never -- \
     psql -h postgres -U postgres -c 'select 1'
   ```

### 2. GitHub 레포 + Docker Hub 시크릿

1. GitHub 레포 [Erichong7/cloud-native-final-project](https://github.com/Erichong7/cloud-native-final-project)(**public**)에 이 폴더를 push한다 (11주차처럼 SSH 키 사용).
2. Docker Hub → Account settings → Personal access tokens → **Read & Write** 토큰 생성.
3. GitHub 레포 → Settings → Secrets and variables → Actions에 등록:
   - `DOCKERHUB_USERNAME`: Docker Hub 아이디
   - `DOCKERHUB_TOKEN`: 위 토큰
4. GitHub 레포 → Settings → Actions → General → Workflow permissions가 **Read and write**인지 확인.
5. Actions 탭에서 워크플로를 실행(또는 아무 코드나 수정해서 push)한다.
   끝나면 `k8s/10-backend.yaml`, `k8s/20-frontend.yaml`의 image가 `아이디/board-backend:커밋SHA`로 바뀐 커밋이 자동으로 생긴다.
   → **이 커밋이 생긴 다음에 ArgoCD를 연결**해야 ImagePullBackOff가 나지 않는다.

### 3. ArgoCD 연결

UI로 만들 때 (11주차와 동일하게 하되 아래만 다르게):
- Repository URL: `https://github.com/Erichong7/cloud-native-final-project.git`, Revision: `main`, **Path: `k8s`**
- **SYNC POLICY: Automatic** (PRUNE RESOURCES, SELF HEAL 체크)
- AUTO-CREATE NAMESPACE 체크, Namespace: `board`

또는 VM에서 레포를 clone한 뒤:
```bash
kubectl apply -f argocd/application.yaml
```

확인:
```bash
kubectl get all,ingress,endpoints -n board
```
backend 파드가 `1/1 Running`이면 DB 연결까지 된 것이다 (readinessProbe가 DB를 확인함).
Spring Boot라 처음 뜰 때 `0/1`로 30초~1분 정도 머무는 게 정상이다 (`kubectl logs -n board deploy/backend -f`로 `Started BoardApplication` 확인).

브라우저: **http://localhost:2000**

### 4. 모니터링

1. ServiceMonitor는 `k8s/`에 들어 있어서 ArgoCD가 같이 배포한다.
2. Prometheus → Status → Targets에서 `serviceMonitor/board/backend`가 **UP**인지 확인.
3. Grafana → Dashboards → New → Import → `grafana/board-dashboard.json` 업로드 → Prometheus 데이터소스 선택.
   - 패널: 사용 가능한 Pod 수, 게시글 작성 수, Pod 재시작 수, 5xx 에러율, 엔드포인트별 초당 요청 수, 응답 시간 p95, 작성/수정/삭제 이벤트, 상태 코드별 요청 수, Pod CPU/메모리
4. 12주차에서 import한 13332(kube-state-metrics-v2) 대시보드에서 `board` 네임스페이스도 같이 보여주면 좋다.

부하를 조금 줘서 그래프를 움직이게 하려면:
```bash
for i in $(seq 1 200); do curl -s http://10.0.2.20/api/posts > /dev/null; done   # 노드(myserver01)에서 실행
```

---

## 5분 시연 순서 (예시)

| 시간 | 내용 | 보여줄 것 |
|---|---|---|
| 0:00 | 구조 설명 | `kubectl get deploy,svc,ingress,endpoints -n board -o wide` (frontend·backend 분리, postgres Endpoints → 10.0.2.3) |
| 0:40 | CRUD | 브라우저에서 작성 → 수정 → 삭제 |
| 1:40 | DB 상태 | myserver01에서 `sudo -u postgres psql -c 'select * from posts;'` |
| 2:10 | CI/CD | `frontend/index.html`의 게시판 이름(예: `자유게시판` → `자유게시판 (배포 테스트)`) 수정 후 push → Actions 성공 → 태그 갱신 커밋 → ArgoCD Sync → 새 파드로 교체 → 화면에 바뀐 이름 (빌드 대기 구간은 편집) |
| 3:40 | 모니터링 | Prometheus Targets UP → Grafana 게시판 대시보드에서 방금 한 요청이 그래프에 반영 |
| 4:30 | 복구 | `kubectl delete pod -n board -l app=backend` → 자동 재생성 (Deployment / ArgoCD selfHeal) |

## 보고서에 넣을 제한사항

- **서버리스 함수 미구현** (CI/CD·모니터링으로 배점 충족)
- DB가 클러스터 밖 단일 노드에 있음: K8s가 DB를 관리하지 않고 DB 노드 장애 시 서비스 전체가 중단됨 (SPOF). 개선안으로 StatefulSet + PV 또는 관리형 DB(RDS)를 언급.
- DB 위치를 Endpoints에 IP로 고정해서, DB 노드 IP가 바뀌면 매니페스트를 수정해야 함
- Secret이 Git에 base64로만 저장됨 (암호화 아님) → 개선안: Sealed Secrets, External Secrets
- ArgoCD는 Git을 주기적으로 조회(기본 약 3분)해서 push 직후 바로 반영되지 않음 → 개선안: GitHub Webhook
- 로컬 VM 환경이라 MetalLB IP를 VirtualBox 포트포워딩으로만 외부에서 접근 가능, HTTPS 미적용
- Spring Boot(JVM)는 파드 하나에 메모리를 400~600MB 정도 써서, VM 자원 때문에 backend 레플리카를 1개로 둠
- 테이블은 JPA `ddl-auto: update`로 자동 생성함. 운영 환경이라면 Flyway 같은 마이그레이션 도구를 써야 함

## 자주 생기는 문제

| 증상 | 원인 / 해결 |
|---|---|
| backend `CrashLoopBackOff` 또는 계속 Not Ready | 대부분 DB 연결 실패 (Spring은 DB가 안 붙으면 시작 자체를 못 함). `kubectl logs -n board deploy/backend`에서 `Connection refused`/`pg_hba.conf` 메시지 확인 → 1단계 |
| backend `OOMKilled` | VM 메모리 부족. `k8s/10-backend.yaml`의 `limits.memory`를 768Mi로 올리거나 다른 실습 리소스 정리 |
| Actions 첫 빌드가 오래 걸림 (3~5분) | Gradle 의존성 다운로드 때문. 두 번째부터는 캐시로 빨라짐 |
| `ImagePullBackOff` | CI가 아직 안 돌아서 image가 `DOCKERHUB_USERNAME/...` 그대로임. 2단계 먼저 |
| ArgoCD sync 실패: `no matches for kind ServiceMonitor` | kube-prometheus-stack 미설치. 설치하거나 `k8s/40-servicemonitor.yaml`을 잠시 빼기 |
| Actions의 마지막 push 단계 403 | Workflow permissions를 Read and write로 변경 |
| `kubectl edit`로 바꾼 값이 원래대로 돌아감 | ArgoCD selfHeal 동작(정상). Git을 수정해야 함 |
| 화면은 뜨는데 목록이 안 나옴 | Ingress `/api` 경로 확인: `curl -i http://10.0.2.20/api/posts` |

## 로컬에서 먼저 확인하기 (선택)

IntelliJ나 터미널에서 백엔드만 실행 (JDK 21 필요):
```bash
cd backend
DB_HOST=10.0.2.3 DB_PASSWORD=mysecretpassword ./gradlew bootRun
curl localhost:8080/api/posts
```

컨테이너로 전체 확인:

```bash
cd local-test
docker compose up --build          # DB는 10.0.2.3의 PostgreSQL 사용
curl localhost:8080/api/posts
```
