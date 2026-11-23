package i18n

func init() {
	ptBR["config file (default is /etc/breeze/agent.yaml)"] = "arquivo de configuração (padrão: /etc/breeze/agent.yaml)"
	ptBR["Breeze server URL"] = "URL do servidor Breeze"
	ptBR["Enrollment secret (AGENT_ENROLLMENT_SECRET on the server)"] = "Segredo de registro (AGENT_ENROLLMENT_SECRET no servidor)"
	ptBR["Site ID to enroll into (optional, overrides enrollment key default)"] = "ID do site para registro (opcional, substitui o padrão da chave de registro)"
	ptBR["Device role override (e.g. workstation, server)"] = "Substituir a função do dispositivo (por exemplo, workstation, server)"
	ptBR["Re-enroll even if already enrolled; replaces AgentID/AuthToken on success (no-op on failure)"] = "Registrar novamente, mesmo se já registrado; substitui AgentID/AuthToken em caso de sucesso (sem alteração em caso de falha)"
	ptBR["Suppress stdout progress output (errors still go to stderr). Intended for unattended installs."] = "Ocultar o progresso em stdout (erros continuam em stderr). Para instalações automáticas."
	ptBR["Pipe-packed bootstrap inputs from the MSI BootstrapEnroll CA: <OriginalDatabase>|<BOOTSTRAP_TOKEN>|<SERVER_URL>"] = "Dados de inicialização do MSI BootstrapEnroll CA separados por barra vertical: <OriginalDatabase>|<BOOTSTRAP_TOKEN>|<SERVER_URL>"
	ptBR["Suppress stdout progress output (errors still go to stderr)"] = "Ocultar o progresso em stdout (erros continuam em stderr)"
	ptBR["Quick Support code (overrides the code embedded in the filename)"] = "Código de suporte rápido (substitui o código incluído no nome do arquivo)"
	ptBR["Helper role: 'system' (desktop capture) or 'user' (script execution)"] = "Função do auxiliar: 'system' (captura de desktop) ou 'user' (execução de scripts)"
	ptBR["Desktop context: 'user_session' or 'login_window'"] = "Contexto de desktop: 'user_session' ou 'login_window'"
	ptBR["Also install the per-user desktop helper LaunchAgent"] = "Também instalar o LaunchAgent do auxiliar de desktop por usuário"
	ptBR["Skip automatic watchdog installation"] = "Ignorar a instalação automática do watchdog"
	ptBR["Also install the per-user desktop helper systemd unit"] = "Também instalar a unidade systemd do auxiliar de desktop por usuário"
	ptBR[`
Breeze Quick Support
─────────────────────────────────────
Connected. Waiting for your technician…
Nothing is permanently installed. Close this window
or press Ctrl+C at any time to stop sharing.
`] = "\nSuporte rápido Breeze\n─────────────────────────────────────\nConectado. Aguardando seu técnico…\nNada é instalado permanentemente. Feche esta janela\nou pressione Ctrl+C a qualquer momento para parar o compartilhamento.\n"
	ptBR[`Runs this binary as an ephemeral Breeze Quick Support client.

The client redeems a one-time support code, enrolls a temporary device into a
directory under the system temp folder, serves a single remote-support session,
and then removes itself. Nothing is permanently installed and no existing
Breeze agent on this machine is touched.

The code and server are normally embedded in the downloaded filename
(breeze-support-<CODE>-<host>.exe); --code / --server override them, and if
neither is available the client prompts.`] = "Executa este programa como cliente temporário do suporte rápido Breeze.\n\nO cliente resgata um código de suporte de uso único, registra um dispositivo\ntemporário em uma pasta dentro do diretório temporário do sistema, atende\numa única sessão de suporte remoto e depois remove seus arquivos. Nada é\ninstalado permanentemente e nenhum agente Breeze existente é alterado.\n\nO código e o servidor normalmente estão incluídos no nome do arquivo baixado\n(breeze-support-<CODE>-<host>.exe); --code / --server substituem esses valores.\nSe nenhum valor estiver disponível, o cliente solicitará que você os informe."
}
