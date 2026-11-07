# FoodFolio

A Hebrew (RTL) recipe app for Android and iOS. Save recipes from links, photos or shared posts, plan the week's meals, cook step by step, and turn recipes into an aisle-sorted shopping list.

Built with Expo (React Native) and a small serverless backend on AWS that uses a language model to read recipes.

## Features

- **Import recipes** from a link, a photo, pasted text (such as an Instagram caption) or by hand. A review step lets you edit everything before saving.
- **Share into FoodFolio** from Instagram, TikTok, Chrome and other apps: the shared link or text opens Add Recipe and imports automatically (Android and iOS builds, not Expo Go).
- **Clean data**: ingredient names, units and supermarket aisles are normalised by the model and by code.
- **Editable quantities** everywhere with quick +/- steppers, plus servings scaling.
- **Ingredient substitutions** suggested for the recipe's amounts.
- **Meal planner** with auto-fill, batch cooking (cook once, eat for days) and a configurable 2, 3 or 5 meals per day.
- **Shopping list** grouped by aisle, with merged items, and sharing as a plain checklist for WhatsApp or Notes.
- **Cooking mode**, recipe sharing (PDF, with a plain-text fallback) and tags such as vegetarian or quick.

## Architecture

```
app (Expo, SQLite on device)
   │  HTTPS, X-Install-Id header
   ▼
API Gateway (HTTP API, throttled) ──▶ Lambda (Python 3.13) ──▶ OpenAI (structured outputs)
                                         ├─ DynamoDB: daily usage caps
                                         └─ SSM Parameter Store: API key
```

All recipes, plans and shopping lists are stored locally on the phone (SQLite). Only recipe import and substitutions call the backend. Details, security model and costs are in [Backend/README.md](Backend/README.md).

## Project structure

| Path | What it holds |
|---|---|
| `App.js` | App shell: fonts, RTL, navigation, share-intent handler |
| `screens/` | One file per screen (home, planner, shopping, recipe detail, add/edit, cooking, settings) |
| `components/` | Shared UI kit (`UI/kit.js`), planner sheets, batch cooking |
| `constants/` | Theme tokens, aisles and categories, API address |
| `util/` | Database, import/API clients, planner logic, shopping list, recipe helpers (unit tested) |
| `Backend/` | The Lambda service, SAM template and tests |
| `eas.json` | EAS build profiles |

## Getting started

Requirements: a recent Node LTS and the Expo Go app (for everything except sharing into the app).

```bash
npm install
npm start
```

Create a `.env` file (it is git-ignored) with the backend address:

```
EXPO_PUBLIC_API_URL=https://<api-id>.execute-api.<region>.amazonaws.com
```

Run the tests:

```bash
npm test
```

Browser preview with sample recipes: `npm run web` (in-memory database; a "load sample data" button is in Settings).

## Building the app

Builds run on Expo's servers with [EAS](https://docs.expo.dev/build/introduction/). Commit your changes first, since `eas.json` requires a clean tree.

| Profile | Result | Use it for |
|---|---|---|
| `apk` | Standalone Android APK | Installing on a phone to try the app |
| `development` | Dev-client APK | Developing with live reload, including share-to-app |
| `production` | Store bundle | Releasing |

```bash
npx eas-cli login
npx eas-cli build --profile apk --platform android
```

Open the build link on the phone and install the APK. All profiles set `EXPO_PUBLIC_API_URL` to the deployed API.

For the development build, install the APK, then run `npx expo start --dev-client`.

## Backend

The backend lives in `Backend/` and deploys with the AWS SAM CLI.

```bash
cd Backend
sam build --use-container
sam deploy --stack-name foodfolio-api --region eu-central-1 --resolve-s3 \
  --capabilities CAPABILITY_IAM --parameter-overrides AlertEmail=you@example.com MonthlyBudgetUsd=3
```

Before the first deploy, store the model API key as a SecureString parameter named `/foodfolio/llm-api-key` in the same region. The deploy output prints the API address.

To run the API locally (needs Docker or Python 3.13), put `OPENAI_API_KEY` in `.env` and run `python Backend/dev_server.py`. Point `EXPO_PUBLIC_API_URL` at `http://<your-pc-ip>:8787`.

Tests and lint:

```bash
cd Backend
pip install -e ".[dev]"
ruff check .
pytest
```

## Notes

- The model is configured with `LLM_MODEL` (default `gpt-6-luna`). Any OpenAI-compatible endpoint can be used through `LLM_BASE_URL`.
- Some recipe sites refuse requests from cloud servers. In that case the app fetches the page on the phone and sends the HTML to the API.
- Privacy policy: https://foodfolio.streamlit.app/
