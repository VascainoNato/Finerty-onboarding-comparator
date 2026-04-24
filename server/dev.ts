import express from 'express'
import type { Request, Response } from 'express'
import chatHandler from '../api/chat'
import historyHandler from '../api/history'
import transcribeHandler from '../api/transcribe'
import traditionalHandler from '../api/traditional'
import sessionsHandler from '../api/sessions'
import supportHandler from '../api/support'

const app = express()

app.use(express.json({ limit: '6mb' }))

app.post('/api/chat', (req: Request, res: Response) => {
  chatHandler(req as never, res as never)
})

app.get('/api/history', (req: Request, res: Response) => {
  historyHandler(req as never, res as never)
})

app.post('/api/transcribe', (req: Request, res: Response) => {
  transcribeHandler(req as never, res as never)
})

app.get('/api/traditional', (req: Request, res: Response) => {
  traditionalHandler(req as never, res as never)
})
app.post('/api/traditional', (req: Request, res: Response) => {
  traditionalHandler(req as never, res as never)
})
app.delete('/api/traditional', (req: Request, res: Response) => {
  traditionalHandler(req as never, res as never)
})

app.get('/api/sessions', (req: Request, res: Response) => {
  sessionsHandler(req as never, res as never)
})
app.patch('/api/sessions', (req: Request, res: Response) => {
  sessionsHandler(req as never, res as never)
})
app.delete('/api/sessions', (req: Request, res: Response) => {
  sessionsHandler(req as never, res as never)
})

app.post('/api/support', (req: Request, res: Response) => {
  supportHandler(req as never, res as never)
})

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true })
})

const PORT = Number(process.env.DEV_API_PORT || 3001)
app.listen(PORT, () => {
  console.log(`[fin-api] dev server listening on http://localhost:${PORT}`)
})
