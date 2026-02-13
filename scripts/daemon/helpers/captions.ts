import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { log } from './logger';
import { formatCommandForCommandsLog, withWorkspaceCommandLog } from './commands-log';

function useFakeCaptionsCli() {
  return process.env.DAEMON_FAKE_CLI === '1' || process.env.DAEMON_USE_FAKE_CLI === '1';
}

export async function generateCaptionsOverlay(params: {
  projectId: string;
  workspaceRoot: string;
  commandsWorkspaceRoot?: string | null;
  logDir: string;
  scriptCaptionWorkspace: string;
  inputJsonPath: string;
  preset?: string | null;
  renderer?: 'python' | 'legacy';
}) {
  const { projectId, workspaceRoot, commandsWorkspaceRoot, logDir, scriptCaptionWorkspace, inputJsonPath, preset, renderer } = params;

  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(logDir, { recursive: true });

  const captionsDir = path.join(workspaceRoot, 'captions-video');
  await fs.mkdir(captionsDir, { recursive: true });
  const outputPath = path.join(captionsDir, 'out-alpha-validated.webm');

  const resolvedInput = path.resolve(inputJsonPath);
  // Basic existence check for the JSON input
  try {
    await fs.access(resolvedInput);
  } catch {
    throw new Error(`Captions input JSON not found at ${resolvedInput}`);
  }

  const presetArg = (preset ?? 'acid').trim();
  const rendererMode: 'python' | 'legacy' = renderer === 'legacy' ? 'legacy' : 'python';
  const commandScript = rendererMode === 'legacy' ? 'render:headless' : 'render:python';
  const commandArgs = ['run', commandScript, '--', '--input', resolvedInput, '--output', outputPath, '--preset', presetArg];
  const displayCommand = `npm ${commandArgs.map((arg) => (/^[\w@./:+-]+$/u.test(arg) ? arg : JSON.stringify(arg))).join(' ')}`;
  const commandLine = formatCommandForCommandsLog({ cmd: 'npm', args: commandArgs, cwd: scriptCaptionWorkspace });
  log.info('Rendering captions overlay', {
    projectId,
    command: displayCommand,
    input: resolvedInput,
    output: outputPath,
    cwd: scriptCaptionWorkspace,
    preset: presetArg,
    renderer: rendererMode,
  });

  if (useFakeCaptionsCli()) {
    const logPath = path.join(logDir, `captions-${new Date().toISOString().replaceAll(':', '-')}.log`);
    await withWorkspaceCommandLog({
      workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
      commandLine,
      run: async () => {
        await fs.writeFile(outputPath, `FAKE_CAPTION_VIDEO for ${projectId}`, 'utf8');
        await fs.writeFile(
          logPath,
          `Command: ${displayCommand}\n[DUMMY] captions rendered with preset ${presetArg}\n`,
          'utf8',
        );
      },
    });
    log.info('Captions overlay rendering completed (fake CLI)', { projectId, logPath, outputPath });
    return { logPath, outputPath };
  }

  const stamp = new Date().toISOString().replaceAll(':', '-');
  const logPath = path.join(logDir, `captions-${stamp}.log`);
  const stream = fsSync.createWriteStream(logPath, { flags: 'a' });
  const write = (text: string) => {
    try { stream.write(text); } catch {}
  };
  write(`Command: ${displayCommand}\n`);
  write(`Input: ${resolvedInput}\n`);
  write(`Output: ${outputPath}\n`);
  write(`Renderer: ${rendererMode}\n`);
  write(`Started: ${new Date().toISOString()}\n`);
  write('--- STREAM BEGIN ---\n');

  let savedDetected = false;
  let exitCode: number | null = null;
  await withWorkspaceCommandLog({
    workspaceRoot: commandsWorkspaceRoot ?? workspaceRoot,
    commandLine,
    run: async () => {
      const child = spawn('npm', commandArgs, {
        cwd: scriptCaptionWorkspace,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        write(`[STDOUT] ${text}`);
        if (!savedDetected && /Saved\s+.*out-alpha-validated\.webm/i.test(text)) {
          savedDetected = true;
          // If the process doesn't exit on its own shortly after saving, force-kill it (some preview servers linger)
          setTimeout(() => {
            if (child.killed) return;
            try {
              // Attempt to kill process group first (Linux)
              // @ts-ignore
              if (process.platform !== 'win32' && typeof child.pid === 'number') {
                try { process.kill(-child.pid); } catch { try { child.kill(); } catch {} }
              } else {
                child.kill();
              }
              write('[INFO] Renderer process killed after save (cleanup watchdog)\n');
            } catch {}
          }, 10000);
        }
      });
      child.stderr.on('data', (chunk) => {
        write(`[STDERR] ${chunk.toString()}`);
      });

      try {
        exitCode = await new Promise((resolve, reject) => {
          child.once('error', (err) => reject(err));
          child.once('close', (code) => resolve(code ?? 0));
        });
      } catch (err: any) {
        write(`\n[ERROR] Process failed to spawn or crashed: ${err?.message || String(err)}\n`);
        exitCode = -1;
        throw err;
      } finally {
        write(`\n--- STREAM END ---\n`);
        write(`Finished: ${new Date().toISOString()}\n`);
        write(`Exit code: ${exitCode}\n`);
        try { stream.end(); } catch {}
      }

      if (exitCode !== 0) {
        const error = new Error(`Captions rendering failed with code ${exitCode}`);
        (error as any).command = displayCommand;
        (error as any).logPath = logPath;
        throw error;
      }
    },
  });

  if (exitCode !== 0) {
    const error = new Error(`Captions rendering failed with code ${exitCode}`);
    (error as any).command = displayCommand;
    (error as any).logPath = logPath;
    throw error;
  }

  try {
    await fs.access(outputPath);
  } catch {
    throw new Error(`Captions output not found at ${outputPath}`);
  }

  log.info('Captions overlay rendering completed', { projectId, logPath, outputPath });
  return { logPath, outputPath };
}
