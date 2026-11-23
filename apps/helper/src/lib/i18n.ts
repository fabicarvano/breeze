import { useSyncExternalStore } from 'react';
import { workspaceTranslations } from './workspaceTranslations';

export type HelperLocale = 'en' | 'pt-BR';
export function resolveLocale(locale: string | null | undefined): HelperLocale {
  const normalized = locale?.trim().replace(/_/g, '-').toLowerCase().split(/[.@]/)[0];
  return normalized === 'pt' || normalized === 'pt-br' ? 'pt-BR' : 'en';
}
let locale: HelperLocale = 'en';
const subscribers = new Set<() => void>();
export function setHelperLocale(value: string | null | undefined) {
  const next = resolveLocale(value);
  if (next === locale) return;
  locale = next;
  document.documentElement.lang = locale;
  subscribers.forEach((notify) => notify());
}
export function getHelperLocale() { return locale; }
const translations: Record<string, string> = {
  ...workspaceTranslations,
  "What's your name?": 'Qual é o seu nome?',
  'Enter your name': 'Digite seu nome',
  'Continue': 'Continuar',
  'Welcome to {name}': 'Bem-vindo ao {name}',
  'Connecting to {name}…': 'Conectando ao {name}…',
  'Connecting to the Breeze agent…': 'Conectando ao agente Breeze…',
  'Failed to connect': 'Falha ao conectar',
  'Retry': 'Tentar novamente',
  'Not connected': 'Desconectado',
  'Connect': 'Conectar',
  'Files': 'Arquivos',
  'Chat': 'Chat',
  'History': 'Histórico',
  'Device Info': 'Informações do dispositivo',
  'Back': 'Voltar',
  'Loading...': 'Carregando...',
  'No conversations yet': 'Nenhuma conversa ainda',
  'Show script': 'Mostrar script',
  'Approval Required': 'Aprovação necessária',
  'Show parameters': 'Mostrar parâmetros',
  'Deny': 'Negar',
  'Allow': 'Permitir',
  'Auto-deny {countdown}': 'Negação automática em {countdown}',
  'Failed to load device info': 'Falha ao carregar informações do dispositivo',
  'Hostname': 'Nome do computador',
  'Operating System': 'Sistema operacional',
  'Status': 'Status',
  'Last Check-in': 'Última comunicação',
  'Agent Version': 'Versão do agente',
  'Helper Version': 'Versão do Helper',
  'Hide chat': 'Ocultar chat',
  'Show chat': 'Mostrar chat',
  'Conversation flagged': 'Conversa sinalizada',
  'Flag conversation for review': 'Sinalizar conversa para revisão',
  'Flagged': 'Sinalizada',
  'Flag': 'Sinalizar',
  'New conversation': 'Nova conversa',
  'New': 'Nova',
  'Minimize': 'Minimizar',
  'Close to tray': 'Fechar para a bandeja',
  'Send': 'Enviar',
  'Thinking': 'Pensando',
  'Using {tool}...': 'Usando {tool}...',
  'Checking your system...': 'Verificando seu sistema...',
  'Hi{username}! I\'m {name}.': 'Olá{username}! Sou {name}.',
  'Ask me anything about your computer.': 'Pergunte-me qualquer coisa sobre seu computador.',
  'Ask me anything...': 'Pergunte-me qualquer coisa...',
  'Remote support request': 'Solicitação de suporte remoto',
  'A technician': 'Um técnico',
  'wants to start a remote session on this computer.': 'deseja iniciar uma sessão remota neste computador.',
  'requested just now': 'solicitado agora',
  'Connecting automatically in {countdown}': 'Conectando automaticamente em {countdown}',
  'Declining automatically in {countdown}': 'Recusando automaticamente em {countdown}',
  'Dangerous patterns must be acknowledged from the Breeze web or mobile approval — this window cannot acknowledge them.': 'Padrões perigosos precisam ser confirmados na aprovação web ou móvel do Breeze — esta janela não pode confirmá-los.',
  'online': 'online',
  'offline': 'offline',
  'active': 'ativo',
  'idle': 'inativo',
  'low': 'baixo',
  'medium': 'médio',
  'high': 'alto',
  'critical': 'crítico',
  'locked': 'bloqueado',
  'disconnected': 'desconectado',
  'Dismiss error': 'Dispensar erro',
  'unknown': 'desconhecido',
  'Unknown': 'Desconhecido',
  'closed': 'encerrado',
  'expired': 'expirado',
  'Untitled': 'Sem título',
  'Just now': 'Agora',
  'just now': 'agora',
  '{count}m ago': 'há {count} min',
  '{count}h ago': 'há {count} h',
  '{count}d ago': 'há {count} dias',
  ' · {count} turns': ' · {count} interações',
  'offline {duration}': 'offline há {duration}',
  'idle {duration}': 'inativo há {duration}',
  'Untitled conversation': 'Conversa sem título',
  'Support provider: {company}': 'Prestador de suporte: {company}',
  'Breeze Assist has not received its credentials from the Breeze agent. Check that the Breeze agent is running, then retry. If this keeps happening, contact your administrator.': 'O Breeze Assist não recebeu suas credenciais do agente Breeze. Verifique se o agente Breeze está em execução e tente novamente. Se o problema persistir, entre em contato com seu administrador.',
  'An error occurred': 'Ocorreu um erro',
  'Failed to load session': 'Falha ao carregar a sessão',
  'Failed to create session': 'Falha ao criar a sessão',
  'Failed to send message': 'Falha ao enviar a mensagem',
  'Another response is still in progress.': 'Outra resposta ainda está em andamento.',
  'Failed to process approval': 'Falha ao processar a aprovação',
  'Failed to flag session': 'Falha ao sinalizar a sessão',
};
export function t(english: string, params: Record<string, string | number> = {}): string {
  const template = locale === 'pt-BR' ? (translations[english] ?? english) : english;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match);
}
export function useI18n() {
  useSyncExternalStore((notify) => { subscribers.add(notify); return () => { subscribers.delete(notify); }; },
    getHelperLocale, () => 'en' as const);
  return t;
}
