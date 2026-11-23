package i18n

func init() {
	ptBR["Enrollment failed: %s"] = "Falha no registro: %s"
	ptBR["enrollment key not recognized — verify the key is active in Settings → Enrollment on the server"] = "chave de registro não reconhecida — verifique se ela está ativa em Configurações → Registro no servidor"
	ptBR["enrollment endpoint not found on %s — check that SERVER_URL is correct (did you include /api or point at the wrong host?)"] = "endpoint de registro não encontrado em %s — verifique SERVER_URL (você incluiu /api ou informou o host errado?)"
	ptBR["rate limited by server — wait one minute and retry the install"] = "limite de solicitações do servidor atingido — aguarde um minuto e tente instalar novamente"
	ptBR["server error %d — contact Breeze support if this persists"] = "erro %d do servidor — contate o suporte Breeze se o problema persistir"
	ptBR["server unreachable at %s — check firewall, DNS, and that SERVER_URL is correct"] = "servidor inacessível em %s — verifique o firewall, o DNS e SERVER_URL"
	ptBR["an existing device already uses this hostname and this install could not present that device's token"] = "um dispositivo existente já usa este nome de host e esta instalação não apresentou o token dele"
	ptBR["the existing device row for this hostname is decommissioned but its agent token was suspended after a cross-tenant probe alarm"] = "o dispositivo existente com este nome de host está desativado, mas seu token foi suspenso após um alerta de acesso entre organizações"
	ptBR["the existing device for this hostname is quarantined pending administrator review"] = "o dispositivo existente com este nome de host está em quarentena, aguardando análise do administrador"
	ptBR["enrollment blocked by an identity conflict — %s. An administrator must decommission the existing device first (Devices → select the device → Decommission) to free this hostname, or resolve the specific conflict directly (approve/un-quarantine the device, or clear its suspended agent token) before retrying."] = "registro bloqueado por conflito de identidade — %s. O administrador deve primeiro desativar o dispositivo existente (Devices → selecione o dispositivo → Decommission) para liberar o nome de host, ou resolver o conflito diretamente (aprovar/retirar da quarentena ou liberar o token suspenso) antes de tentar novamente."
	ptBR["enrollment key required — pass it positionally or set BREEZE_AGENT_ENROLLMENT_KEY"] = "chave de registro necessária — informe-a como argumento ou defina BREEZE_AGENT_ENROLLMENT_KEY"
	ptBR["could not clear previous helper branding"] = "não foi possível remover a identidade anterior do auxiliar"
	ptBR["enrollment refused: backup control-plane host not allowed"] = "registro recusado: host de controle de backup não permitido"
	ptBR["could not create or secure the config directory %s, so no enrollment request was sent — run enrollment as SYSTEM (the MSI does) or from an elevated administrator prompt, then retry"] = "não foi possível criar ou proteger a pasta de configuração %s; nenhuma solicitação de registro foi enviada — execute como SYSTEM (o MSI faz isso) ou em um terminal de administrador e tente novamente"
	ptBR["Error: Permission denied reading agent configuration."] = "Erro: permissão negada ao ler a configuração do agente."
	ptBR["The agent runs as a system service and should not be started manually."] = "O agente é executado como serviço do sistema e não deve ser iniciado manualmente."
	ptBR["Check service status with:"] = "Verifique o status do serviço com:"
	ptBR["Failed to load config: %v\n"] = "Falha ao carregar a configuração: %v\n"
	ptBR["Failed to start agent: %v\n"] = "Falha ao iniciar o agente: %v\n"
}

func init() {
	ptBR["the server enrolled this device (%s) but its credentials could not be saved to %s, so the agent cannot check in. The device was created on the server and will stay pending: delete it in the dashboard, fix the cause below, then run enrollment again"] = "o servidor registrou este dispositivo (%s), mas suas credenciais não puderam ser salvas em %s, impedindo a comunicação do agente. O dispositivo foi criado no servidor e ficará pendente: exclua-o no painel, corrija a causa abaixo e registre novamente"
}
