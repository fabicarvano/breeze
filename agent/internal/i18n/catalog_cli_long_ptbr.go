package i18n

func init() {
	ptBR[`Breeze Agent - Remote Monitoring and Management agent for Windows, macOS, and Linux`] = "Breeze Agent - Agente de monitoramento e gerenciamento remoto para Windows, macOS e Linux"
	ptBR[`Enroll this device with the Breeze server.

The enrollment key may be given positionally (visible in this process's own
command line to any local user who can list processes — kept only for manual,
interactive use and backward compatibility) or, preferably, via the
BREEZE_AGENT_ENROLLMENT_KEY environment variable, which install.sh and the
other unattended install paths use so the key never appears in argv.`] = "Registre este dispositivo no servidor Breeze.\n\nA chave de registro pode ser informada como argumento (visível na linha de comando\ndo processo para usuários locais que podem listar processos — mantida apenas para\nuso manual e compatibilidade) ou, preferencialmente, pela variável de ambiente\nBREEZE_AGENT_ENROLLMENT_KEY, usada por install.sh e outros instaladores automáticos\npara que a chave nunca apareça nos argumentos do processo."
	ptBR[`The user-helper runs in the logged-in user's session context and provides
desktop notifications, system tray icon, screen capture, clipboard access,
and user-context script execution. It communicates with the root daemon
via a local IPC socket and has no direct network access.`] = "O user-helper é executado na sessão do usuário conectado e oferece notificações,\nícone na bandeja, captura de tela, acesso à área de transferência e execução\nde scripts no contexto do usuário. Ele se comunica com o daemon principal\npor um socket IPC local e não possui acesso direto à rede."
}
