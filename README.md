# 🎮 数独 BATTLE — Online Multiplayer Sudoku

실시간 온라인 멀티플레이 스도쿠 게임입니다.  
Node.js + Socket.io 기반으로 WebSocket을 통해 두 플레이어가 서로 다른 장소에서 대결할 수 있습니다.

---

## ✨ 기능

| 기능 | 설명 |
|------|------|
| ⚔️ 1v1 온라인 대결 | 다른 장소에서 같은 퍼즐을 풀며 실시간 경쟁 |
| 🤝 협력 모드 | 함께 퍼즐 풀기 (온라인) |
| 📊 실시간 진행도 | 상대방 보드 미리보기 + 진행도 바 |
| 🏠 방 코드 | 6자리 코드로 친구 초대 |
| 🔗 링크 초대 | URL에 방 코드 포함하여 공유 |
| 💬 채팅 | 인게임 채팅 + 이모지 반응 |
| 👁 관전 모드 | 방이 가득 찬 경우 관전 입장 |
| 🤖 AI 대전 (오프라인) | 서버 없이 로컬에서 AI 대결 |
| ⏱ 솔로 타임어택 | 오프라인 혼자 플레이 |
| 💡 힌트 시스템 | 서버 검증, 3회 사용 가능 |
| 📝 메모 모드 | 후보 숫자 메모 기능 |
| 🔄 재접속 | 연결 끊김 후 30초 내 재접속 가능 |

---

## 🚀 무료 배포 가이드

### 방법 1: Railway (추천 ⭐)

1. [railway.app](https://railway.app) 가입 (GitHub 로그인)
2. **New Project** → **Deploy from GitHub repo**
3. 이 프로젝트를 GitHub에 올린 후 연결
4. 자동 배포 완료! URL이 생성됩니다

또는 Railway CLI:
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### 방법 2: Render

1. [render.com](https://render.com) 가입
2. **New** → **Web Service**
3. GitHub repo 연결
4. Build Command: `npm install`
5. Start Command: `npm start`
6. **Create Web Service** 클릭

### 방법 3: 로컬 테스트 (같은 Wi-Fi)

```bash
npm install
npm start
# http://localhost:3000 으로 접속
# 같은 네트워크 내 다른 기기: http://[내IP]:3000
```

---

## 📁 프로젝트 구조

```
sudoku-battle/
├── server.js          # Node.js + Socket.io 서버
├── package.json
├── railway.toml       # Railway 배포 설정
├── render.yaml        # Render 배포 설정
└── public/
    └── index.html     # 클라이언트 (전체 게임 UI)
```

---

## 🎮 게임 방법

### 온라인 대결
1. 한 명이 **방 만들기** → 모드·난이도 선택 → 방 생성
2. 6자리 코드 또는 링크를 친구에게 공유
3. 친구가 **방 참가** → 코드 입력 → 입장
4. 2명 모두 입장하면 카운트다운 후 자동 시작!

### 조작 방법
- 셀 클릭 → 숫자 키(1~9) 또는 화면 숫자패드 입력
- 방향키로 셀 이동
- Backspace/Delete로 지우기

---

## ⚙️ 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `3000` | 서버 포트 |
| `NODE_ENV` | `development` | 환경 |

---

## 🛠 개발

```bash
npm install
npm run dev   # nodemon으로 자동 재시작
```
