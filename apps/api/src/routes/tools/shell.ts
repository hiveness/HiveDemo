import type { FastifyInstance } from 'fastify'
import { exec } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'

const PROJECT_ROOT = path.resolve(process.cwd(), '../../')

const safePath = (relativePath: string) => {
    const resolved = path.resolve(PROJECT_ROOT, relativePath)
    return resolved
}

export async function shellRouter(app: FastifyInstance) {
    // ── exec_command ───────────────────────────────────────────────────────────────
    app.post('/exec_command', async (req, reply) => {
        const { command, cwd, timeout_ms = 30000 } = req.body as any
        const workingDir = cwd ? safePath(cwd) : PROJECT_ROOT

        try {
            const result = await new Promise<{ stdout: string, stderr: string, code: number | null }>((resolve, reject) => {
                const child = exec(command, { cwd: workingDir, timeout: timeout_ms }, (error, stdout, stderr) => {
                    resolve({
                        stdout,
                        stderr,
                        code: error ? error.code || 1 : 0
                    })
                })
            })

            return {
                result: `exit_code=${result.code}\n\nSTDOUT:\n${result.stdout.slice(0, 3000)}\n\nSTDERR:\n${result.stderr.slice(0, 1000)}`
            }
        } catch (error: any) {
            return reply.status(500).send({ result: `ERROR: ${error.message}` })
        }
    })

    // ── run_python ─────────────────────────────────────────────────────────────────
    app.post('/run_python', async (req, reply) => {
        const { code, packages = [] } = req.body as any

        if (packages.length > 0) {
            try {
                await new Promise<void>((resolve, reject) => {
                    exec(`${process.env.PYTHON_PATH || 'python3'} -m pip install ${packages.join(' ')}`, (error) => {
                        if (error) reject(error)
                        else resolve()
                    })
                })
            } catch (e: any) {
                return { result: `ERROR installing packages: ${e.message}` }
            }
        }

        const tmpDir = os.tmpdir()
        const tmpFile = path.join(tmpDir, `hive_script_${Date.now()}.py`)

        try {
            fs.writeFileSync(tmpFile, code)

            const result = await new Promise<{ stdout: string, stderr: string }>((resolve, reject) => {
                const child = exec(`${process.env.PYTHON_PATH || 'python3'} ${tmpFile}`, { timeout: 30000 }, (error, stdout, stderr) => {
                    resolve({ stdout, stderr })
                })
            })

            return {
                result: `STDOUT:\n${result.stdout.slice(0, 3000)}\nSTDERR:\n${result.stderr.slice(0, 500)}`
            }

        } catch (error: any) {
            return { result: `ERROR: ${error.message}` }
        } finally {
            if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
        }
    })
}
