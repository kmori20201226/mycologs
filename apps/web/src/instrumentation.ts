export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { default: logger } = await import('./lib/logger')
        logger.info('Next.js server started')
    }
}
