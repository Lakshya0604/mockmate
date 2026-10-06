# MockMate

AI mock interviews. Pick a role, level and focus, answer 5 questions (type or speak), and get a score and feedback after every answer plus a final report.

## How scoring works
- The AI scores each answer from 0 to 10 against a rubric (relevance, depth, clarity, examples).
- The overall score is the average of your answer scores, calculated in code (`server/scoring.js`, covered by tests).
- Feedback includes a stronger sample answer so you can compare.

## Stack
MongoDB (Atlas) + Express + React (Vite) + Node. JWT auth with bcrypt. Groq LLM (gpt-oss-120b), Gemini as fallback. Voice input uses the browser's Web Speech API where available (Chrome, Edge, Safari).

## Run locally
```
cp .env.example .env   # MONGODB_URI, JWT_SECRET, GROQ_API_KEY
npm install && npm run build && npm start
npm test
```

## Deploy (Render)
Build: `npm install && npm run build` - Start: `npm start` - Env: `MONGODB_URI`, `JWT_SECRET`, `GROQ_API_KEY`
