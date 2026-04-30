import pino from 'pino'
import path from 'path'
import fs from 'fs'

const LOG_DIR = path.resolve(process.cwd(), '../../logs')
const LOG_FILE = path.join(LOG_DIR, 'web.log')

fs.mkdirSync(LOG_DIR, { recursive: true })

const logger = pino(
    { level: process.env.LOG_LEVEL ?? 'info' },
    pino.destination({ dest: LOG_FILE, sync: false })
)

export default logger
