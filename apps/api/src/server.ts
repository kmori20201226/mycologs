import { buildApp } from './app'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: 3000 })
    console.log('Server running on http://localhost:3000')
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()