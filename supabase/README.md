# Supabase 설정

증빙 파일을 고객이 화면에서 바로 열어볼 수 있게 하는 데 씁니다. 온체인에는 계속 해시만 기록하고, 파일 원본은 **비공개 버킷**에 두어 계약 당사자만 열람합니다.

## 1. 프로젝트 만들기

1. https://supabase.com 접속 → 로그인 → **New project**
2. 이름은 아무거나 (예: `giwa-trust-escrow`), 리전은 **Northeast Asia (Seoul)** 권장
3. 데이터베이스 비밀번호는 아무거나 정하고 따로 보관 (이 프로젝트에서는 쓰지 않습니다)

## 2. 테이블 만들기

좌측 메뉴 **SQL Editor** → `schema.sql` 내용을 전부 붙여넣고 **Run**

## 3. 저장소(버킷) 만들기

좌측 메뉴 **Storage** → **New bucket**

- 이름: `evidence`
- **Public bucket 체크 해제** ← 반드시 비공개여야 합니다

## 4. 키 확인

좌측 메뉴 **Project Settings → API**

| 값 | 어디에 쓰나 | 공개 여부 |
|---|---|---|
| Project URL | `SUPABASE_URL` | 공개돼도 무방 |
| `anon` `public` 키 | 쓰지 않음 | 공개돼도 무방 |
| `service_role` 키 | `SUPABASE_SERVICE_ROLE_KEY` | **절대 공개 금지** |

이 프로젝트는 브라우저에서 Supabase 를 직접 호출하지 않습니다. 서버 라우트만 `service_role` 키로 접근하고, 그 전에 **요청한 지갑이 해당 계약의 당사자인지 온체인에서 확인**합니다.

## 5. 환경변수 넣기

**로컬** — `apps/web/.env.local` 에 추가

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Vercel** — 프로젝트 → Settings → Environment Variables 에 같은 두 개를 추가한 뒤 재배포

> `service_role` 키에는 `NEXT_PUBLIC_` 을 붙이지 마세요. 붙이면 브라우저 번들에 그대로 들어가 누구나 데이터베이스 전체를 조작할 수 있게 됩니다.

## 설정하지 않으면

파일 업로드 기능만 꺼진 채로 나머지는 그대로 동작합니다. 업체는 증빙 링크를 직접 남기고, 고객은 파일 대조 도구로 확인하는 방식으로 넘어갑니다.
