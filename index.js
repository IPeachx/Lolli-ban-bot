import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, Events
} from 'discord.js';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';

const {
  DISCORD_TOKEN,
  ACTIONS_CHANNEL_ID,
  EXPOSE_CHANNEL_ID,
  LOGS_CHANNEL_ID,
  BAN_UNBAN_ROLE_ID,
  LISTS_ROLE_IDS,
  APPLY_GUILD_BANS
} = process.env;

const LISTS_ROLES = (LISTS_ROLE_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const APPLY_REAL_BANS = (APPLY_GUILD_BANS || 'false').toLowerCase() === 'true';

// ===== IMÁGENES PARA PANELES / EXPOSE (cdn.discordapp.com) =====
const PANEL_LOGO_URL   = 'https://media.discordapp.net/attachments/1163056754997874779/1416221323449077840/LOGO-LOLLIPOP-SV.png?ex=68d7daa3&is=68d68923&hm=411f8135d1ef3191301f0446bf9c36ba803a0e405b3b27f4b619ceb008637415&=&format=webp&quality=lossless&width=1541&height=856'; // ej: 'https://cdn.discordapp.com/attachments/<canal>/<id>/logo.png'
const PANEL_BANNER_URL = 'https://media.discordapp.net/attachments/1358209223183569230/1421261299437801513/Bww7G6R.gif?ex=68d8643b&is=68d712bb&hm=2b0c8e121b3681adb9e1ed73338b5168ccdfc6926e853a0895b882124af8ecc6&='; // ej: 'https://cdn.discordapp.com/attachments/<canal>/<id>/banner.png'
const EXPOSE_LOGO_URL  = 'https://media.discordapp.net/attachments/1163056754997874779/1416221323449077840/LOGO-LOLLIPOP-SV.png?ex=68d7daa3&is=68d68923&hm=411f8135d1ef3191301f0446bf9c36ba803a0e405b3b27f4b619ceb008637415&=&format=webp&quality=lossless&width=1541&height=856'; // thumbnail + footer
const EXPOSE_BANNER_URL= 'https://media.discordapp.net/attachments/1379900241314189353/1421265877999026306/RADi7aj.gif?ex=68d8687f&is=68d716ff&hm=033fd956c5155a35975e1217cbc2055d0776ac8e34d1ef3cb2b4a074f12cd53b&='; // imagen por defecto si no hay imagen en Pruebas

// ===== Datos en archivos =====
const DATA_DIR = path.join(process.cwd(), 'data');
const BANS_PATH = path.join(DATA_DIR, 'bans.json');
const EXPOSED_PATH = path.join(DATA_DIR, 'exposed.json');

function ensureDataFiles() {
  fse.ensureDirSync(DATA_DIR);
  if (!fs.existsSync(BANS_PATH)) fs.writeFileSync(BANS_PATH, '[]', 'utf8');
  if (!fs.existsSync(EXPOSED_PATH)) fs.writeFileSync(EXPOSED_PATH, '[]', 'utf8');
}
ensureDataFiles();

function loadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}
function saveJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

// ===== Utilidades =====
function pinkEmbedBase() { return new EmbedBuilder().setColor(0xFFC0CB).setTimestamp(Date.now()); }
function hasRole(member, roleId) { return member?.roles?.cache?.has(roleId); }
function hasAnyRole(member, roleIds = []) { return roleIds.some(r => member?.roles?.cache?.has(r)); }
async function resolveUserTag(client, userId) {
  try {
    const u = await client.users.fetch(userId);
    return `${u.username}${u.discriminator && u.discriminator !== '0' ? '#' + u.discriminator : ''}`;
  } catch { return `Usuario(${userId})`; }
}

// ===== Helpers CSV para exportar =====
function csvEscape(val) {
  const s = (val ?? '').toString();
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function buildBansCSV(bans) {
  const header = ['type','userId','motivo','tiempo','ticket','autorizaId','byId','guildId','createdAt','messageId','channelId'].join(',');
  const rows = bans.map(b => [
    b.type, b.userId, b.motivo, b.tiempo, b.ticket || '', b.autorizaId || '',
    b.byId || '', b.guildId || '', new Date(b.createdAt).toISOString(),
    b.messageId || '', b.channelId || ''
  ].map(csvEscape).join(','));
  return [header, ...rows].join('\n');
}
function buildExposedCSV(expos) {
  const header = ['userId','motivo','tiempo','link1','link2','byId','guildId','createdAt'].join(',');
  const rows = expos.map(e => [
    e.userId, e.motivo, e.tiempo, e.link1 || '', e.link2 || '',
    e.byId || '', e.guildId || '', new Date(e.createdAt).toISOString()
  ].map(csvEscape).join(','));
  return [header, ...rows].join('\n');
}

// ===== Cliente =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.GuildMember, Partials.User]
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Conectado como ${c.user.tag}`);
});

// ====== Panel de botones ======
async function sendControlPanel(channel) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_unban').setLabel('Unban').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_buscar').setLabel('Buscar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_expose').setLabel('Expose').setStyle(ButtonStyle.Secondary),
  );

  const embed = pinkEmbedBase()
    .setTitle('PANEL DE BANEO')
    .setDescription(
      `Este panel ha sido diseñado para centralizar y registrar todas las acciones importantes relacionadas con la moderación del servidor.

**Funciones disponibles:**
• **Ban:** Aplica un baneo con motivo, tiempo y autorización, dejando constancia en el registro oficial.
• **Unban:** Retira un baneo con la misma transparencia, especificando motivo y autorización.
• **Buscar:** Permite consultar el historial de baneos y exposiciones de un usuario.
• **Expose:** Publica información y evidencia (imágenes o clips) sobre casos relevantes con fines informativos.

> Todos los movimientos quedan guardados en el canal de logs para garantizar un seguimiento completo y seguro.`
    );

  if (PANEL_LOGO_URL)   embed.setThumbnail(PANEL_LOGO_URL);
  if (PANEL_BANNER_URL) embed.setImage(PANEL_BANNER_URL);

  await channel.send({ embeds: [embed], components: [row1] });
}

// ====== Modales ======
function buildBanModal() {
  const modal = new ModalBuilder().setCustomId('modal_ban').setTitle('Banear usuario');
  const usuario = new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (ID de Discord)').setStyle(TextInputStyle.Short).setRequired(true);
  const motivo  = new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo de ban').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const tiempo  = new TextInputBuilder().setCustomId('m_tiempo').setLabel('Tiempo de ban (7d, 24h, permanente)').setStyle(TextInputStyle.Short).setRequired(true);
  const ticket  = new TextInputBuilder().setCustomId('m_ticket').setLabel('Número de Ticket').setStyle(TextInputStyle.Short).setRequired(true);
  const autor   = new TextInputBuilder().setCustomId('m_autoriza').setLabel('Usuario que autoriza (ID)').setStyle(TextInputStyle.Short).setRequired(true);
  return modal.addComponents(
    new ActionRowBuilder().addComponents(usuario),
    new ActionRowBuilder().addComponents(motivo),
    new ActionRowBuilder().addComponents(tiempo),
    new ActionRowBuilder().addComponents(ticket),
    new ActionRowBuilder().addComponents(autor),
  );
}
function buildUnbanModal() {
  const modal = new ModalBuilder().setCustomId('modal_unban').setTitle('Desbanear usuario');
  const usuario = new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (ID de Discord)').setStyle(TextInputStyle.Short).setRequired(true);
  const motivo  = new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo de unban').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const ticket  = new TextInputBuilder().setCustomId('m_ticket').setLabel('Número de Ticket').setStyle(TextInputStyle.Short).setRequired(true);
  const autor   = new TextInputBuilder().setCustomId('m_autoriza').setLabel('Usuario que autoriza (ID)').setStyle(TextInputStyle.Short).setRequired(true);
  return modal.addComponents(
    new ActionRowBuilder().addComponents(usuario),
    new ActionRowBuilder().addComponents(motivo),
    new ActionRowBuilder().addComponents(ticket),
    new ActionRowBuilder().addComponents(autor),
  );
}
function buildBuscarModal() {
  const modal = new ModalBuilder().setCustomId('modal_buscar').setTitle('Buscar por usuario');
  const usuario = new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (ID de Discord / mención)').setStyle(TextInputStyle.Short).setRequired(true);
  return modal.addComponents(new ActionRowBuilder().addComponents(usuario));
}
function buildExposeModal() {
  const modal = new ModalBuilder().setCustomId('modal_expose').setTitle('Expose usuario');
  const usuario = new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (ID de Discord)').setStyle(TextInputStyle.Short).setRequired(true);
  const motivo  = new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo de ban / Expose').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const tiempo  = new TextInputBuilder().setCustomId('m_tiempo').setLabel('Tiempo de ban (o "N/A")').setStyle(TextInputStyle.Short).setRequired(true);
  const link1   = new TextInputBuilder().setCustomId('m_link1').setLabel('Pruebas (imagen/clip/link)').setStyle(TextInputStyle.Short).setRequired(true);
  const link2   = new TextInputBuilder().setCustomId('m_link2').setLabel('Clip (opcional)').setStyle(TextInputStyle.Short).setRequired(false);
  return modal.addComponents(
    new ActionRowBuilder().addComponents(usuario),
    new ActionRowBuilder().addComponents(motivo),
    new ActionRowBuilder().addComponents(tiempo),
    new ActionRowBuilder().addComponents(link1),
    new ActionRowBuilder().addComponents(link2),
  );
}

// ====== Paginación de listas ======
const PAGE_SIZE = 10;
function buildPaginationRow(prefix, page, hasPrev, hasNext) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${prefix}_${Math.max(0, page - 1)}`).setLabel('◀️ Anterior').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId(`${prefix}_${page + 1}`).setLabel('Siguiente ▶️').setStyle(ButtonStyle.Primary).setDisabled(!hasNext),
  );
}
async function sendBansPage(interaction, page = 0, initial = false) {
  const bans = loadJson(BANS_PATH);
  const total = bans.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const slice = bans.slice(start, end);

  const lines = await Promise.all(slice.map(async (b, idx) => {
    const tagUser = await resolveUserTag(interaction.client, b.userId);
    const tagAut  = await resolveUserTag(interaction.client, b.autorizaId || b.byId);
    return `**${start + idx + 1}.** [${b.type.toUpperCase()}] ${tagUser} | Ticket ${b.ticket || 'N/A'} | ${b.tiempo || 'N/A'} | ${new Date(b.createdAt).toLocaleString()}\nMotivo: ${b.motivo}\nAutoriza: ${tagAut}`;
  }));

  const embed = pinkEmbedBase().setTitle(`📄 Lista de Bans/Unbans (${total})`).setDescription(lines.join('\n\n') || 'Sin registros.');
  const hasPrev = page > 0;
  const hasNext = end < total;
  const row = buildPaginationRow('page_bans', page, hasPrev, hasNext);

  if (initial) await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  else await interaction.update({ embeds: [embed], components: [row] });
}
async function sendExposePage(interaction, page = 0, initial = false) {
  const expos = loadJson(EXPOSED_PATH);
  const total = expos.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(total, start + PAGE_SIZE);
  const slice = expos.slice(start, end);

  const lines = await Promise.all(slice.map(async (e, idx) => {
    const tagUser = await resolveUserTag(interaction.client, e.userId);
    const tagBy   = await resolveUserTag(interaction.client, e.byId);
    const links   = [e.link1, e.link2].filter(Boolean).join(' | ');
    return `**${start + idx + 1}.** ${tagUser} | ${new Date(e.createdAt).toLocaleString()}\nMotivo: ${e.motivo}\nTiempo: ${e.tiempo}\nLinks: ${links || 'N/A'}\nAutoriza: ${tagBy}`;
  }));

  const embed = pinkEmbedBase().setTitle(`📄 Lista de Exposed (${total})`).setDescription(lines.join('\n\n') || 'Sin registros.');
  const hasPrev = page > 0;
  const hasNext = end < total;
  const row = buildPaginationRow('page_expose', page, hasPrev, hasNext);

  if (initial) await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
  else await interaction.update({ embeds: [embed], components: [row] });
}

// ===== Logs =====
async function sendLog(interaction, action, data) {
  try {
    const logCh = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
    if (!logCh) return;
    const fields = Object.entries(data).slice(0, 25).map(([k, v]) => ({
      name: k,
      value: typeof v === 'string' ? (v || 'N/A') : '```json\n' + JSON.stringify(v, null, 2).slice(0, 950) + '\n```',
      inline: false
    }));
    const embed = pinkEmbedBase()
      .setTitle(`🗂️ Log: ${action}`)
      .addFields(
        { name: 'Ejecutado por', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'En', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Fecha', value: new Date().toLocaleString(), inline: true },
        ...fields
      );
    await logCh.send({ embeds: [embed] });
  } catch (e) {
    console.warn('No se pudo enviar log:', e?.message);
  }
}

// ===== Listener principal =====
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // --- Botones ---
    if (interaction.isButton()) {
      if (interaction.customId === 'btn_ban') {
        if (!hasRole(interaction.member, BAN_UNBAN_ROLE_ID)) return interaction.reply({ content: 'No tienes permiso para usar este botón.', ephemeral: true });
        return interaction.showModal(buildBanModal());
      }
      if (interaction.customId === 'btn_unban') {
        if (!hasRole(interaction.member, BAN_UNBAN_ROLE_ID)) return interaction.reply({ content: 'No tienes permiso para usar este botón.', ephemeral: true });
        return interaction.showModal(buildUnbanModal());
      }
      if (interaction.customId === 'btn_buscar') {
        return interaction.showModal(buildBuscarModal());
      }
      if (interaction.customId === 'btn_expose') {
        return interaction.showModal(buildExposeModal());
      }
      if (interaction.customId.startsWith('page_bans_')) {
        const page = parseInt(interaction.customId.split('_').pop(), 10) || 0;
        return sendBansPage(interaction, page);
      }
      if (interaction.customId.startsWith('page_expose_')) {
        const page = parseInt(interaction.customId.split('_').pop(), 10) || 0;
        return sendExposePage(interaction, page);
      }
    }

    // --- Modales ---
    if (interaction.isModalSubmit()) {
      // BAN
      if (interaction.customId === 'modal_ban') {
        if (!hasRole(interaction.member, BAN_UNBAN_ROLE_ID)) return interaction.reply({ content: 'No tienes permiso para realizar Bans.', ephemeral: true });
        const userId     = interaction.fields.getTextInputValue('m_user').trim();
        const motivo     = interaction.fields.getTextInputValue('m_motivo').trim();
        const tiempo     = interaction.fields.getTextInputValue('m_tiempo').trim();
        const ticket     = interaction.fields.getTextInputValue('m_ticket').trim();
        const autorizaId = interaction.fields.getTextInputValue('m_autoriza').trim();

        const bans = loadJson(BANS_PATH);
        const banRec = {
          type: 'ban',
          userId, motivo, tiempo, ticket, autorizaId,
          byId: interaction.user.id, guildId: interaction.guildId,
          createdAt: Date.now(), messageId: null, channelId: null,
        };
        bans.unshift(banRec);
        saveJson(BANS_PATH, bans);

        if (APPLY_REAL_BANS) {
          try {
            const member = await interaction.guild.members.fetch(userId);
            await member.ban({ reason: `[Ticket ${ticket}] ${motivo}` });
          } catch (e) { console.warn('No se pudo banear realmente:', e?.message); }
        }

        const actionsChannel = interaction.guild.channels.cache.get(ACTIONS_CHANNEL_ID);
        const tagUser = await resolveUserTag(interaction.client, userId);
        const tagAutoriza = await resolveUserTag(interaction.client, autorizaId);
        const actionEmbed = pinkEmbedBase()
          .setTitle('🚫 Ban aplicado')
          .addFields(
            { name: 'Usuario', value: `<@${userId}> (${tagUser})`, inline: true },
            { name: 'Tiempo', value: tiempo, inline: true },
            { name: 'Ticket', value: ticket, inline: true },
            { name: 'Motivo', value: motivo, inline: false },
            { name: 'Autoriza', value: `<@${autorizaId}> (${tagAutoriza})`, inline: false },
          );

        if (actionsChannel) {
          const sent = await actionsChannel.send({ embeds: [actionEmbed] });
          const updated = loadJson(BANS_PATH);
          updated[0].messageId = sent.id;
          updated[0].channelId = actionsChannel.id;
          saveJson(BANS_PATH, updated);
        }

        await sendLog(interaction, 'BAN', { userId, motivo, tiempo, ticket, autorizaId });
        return interaction.reply({ content: '✅ Ban registrado.', ephemeral: true });
      }

      // UNBAN
      if (interaction.customId === 'modal_unban') {
        if (!hasRole(interaction.member, BAN_UNBAN_ROLE_ID)) return interaction.reply({ content: 'No tienes permiso para realizar Unban.', ephemeral: true });
        const userId     = interaction.fields.getTextInputValue('m_user').trim();
        const motivo     = interaction.fields.getTextInputValue('m_motivo').trim();
        const ticket     = interaction.fields.getTextInputValue('m_ticket').trim();
        const autorizaId = interaction.fields.getTextInputValue('m_autoriza').trim();

        const bans = loadJson(BANS_PATH);

        let banToDelete = null;
        if (ticket) banToDelete = bans.find(b => b.type === 'ban' && b.ticket === ticket);
        if (!banToDelete) banToDelete = bans.find(b => b.type === 'ban' && b.userId === userId);

        if (APPLY_REAL_BANS) {
          try { await interaction.guild.bans.remove(userId, `[Ticket ${ticket}] ${motivo}`); }
          catch (e) { console.warn('No se pudo desbanear realmente:', e?.message); }
        }

        bans.unshift({
          type: 'unban', userId, motivo, tiempo: 'N/A', ticket, autorizaId,
          byId: interaction.user.id, guildId: interaction.guildId, createdAt: Date.now()
        });
        saveJson(BANS_PATH, bans);

        // Borrar mensaje de BAN + logs
        if (banToDelete?.messageId && banToDelete?.channelId) {
          try {
            const ch = interaction.guild.channels.cache.get(banToDelete.channelId);
            const msgLink = `https://discord.com/channels/${interaction.guildId}/${banToDelete.channelId}/${banToDelete.messageId}`;
            let deleted = false;
            if (ch) {
              const msg = await ch.messages.fetch(banToDelete.messageId).catch(() => null);
              if (msg) { await msg.delete(); deleted = true; }
            }
            if (deleted) {
              await sendLog(interaction, 'BAN_MESSAGE_DELETED', {
                userId, ticket, channel: `<#${banToDelete.channelId}>`,
                messageId: banToDelete.messageId, ban_message_link: msgLink
              });
            } else {
              await sendLog(interaction, 'BAN_MESSAGE_NOT_FOUND', {
                userId, ticket, channelId: banToDelete.channelId, messageId: banToDelete.messageId
              });
            }
          } catch (e) {
            await sendLog(interaction, 'BAN_MESSAGE_DELETE_ERROR', {
              userId, ticket, error: (e?.message || String(e)).slice(0, 180)
            });
          }
        }

        await sendLog(interaction, 'UNBAN', { userId, motivo, ticket, autorizaId });
        return interaction.reply({ content: '✅ Unban registrado y mensaje de ban eliminado (si existía).', ephemeral: true });
      }

      // BUSCAR
      if (interaction.customId === 'modal_buscar') {
        let input = interaction.fields.getTextInputValue('m_user').trim();
        let userId = input;
        const mention = input.match(/^<@!?(\d+)>$/);
        if (mention) userId = mention[1];

        const bans = loadJson(BANS_PATH).filter(x => x.userId === userId);
        const expos = loadJson(EXPOSED_PATH).filter(x => x.userId === userId);
        const tagUser = await resolveUserTag(interaction.client, userId);

        const embed = pinkEmbedBase().setTitle(`🔎 Búsqueda: ${tagUser}`);
        if (bans.length === 0 && expos.length === 0) {
          embed.setDescription('Sin registros.');
        } else {
          if (bans.length) {
            embed.addFields({ name: `Bans/Unbans (${bans.length})`, value: bans.slice(0, 10).map(b =>
              `• **${b.type.toUpperCase()}** | Ticket ${b.ticket} | ${new Date(b.createdAt).toLocaleString()} | Motivo: ${b.motivo}`
            ).join('\n').slice(0, 1024) });
          }
          if (expos.length) {
            embed.addFields({ name: `Exposed (${expos.length})`, value: expos.slice(0, 10).map(e =>
              `• ${new Date(e.createdAt).toLocaleString()} | Motivo: ${e.motivo} | Tiempo: ${e.tiempo}`
            ).join('\n').slice(0, 1024) });
          }
        }
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // EXPOSE (menciones, logo/banner, Pruebas/Clip y @everyone)
      if (interaction.customId === 'modal_expose') {
        const userId = interaction.fields.getTextInputValue('m_user').trim();
        const motivo = interaction.fields.getTextInputValue('m_motivo').trim();
        const tiempo = interaction.fields.getTextInputValue('m_tiempo').trim();
        const link1  = interaction.fields.getTextInputValue('m_link1').trim();
        const link2  = interaction.fields.getTextInputValue('m_link2').trim();

        const exposed = loadJson(EXPOSED_PATH);
        exposed.unshift({ userId, motivo, tiempo, link1, link2: link2 || null, byId: interaction.user.id, guildId: interaction.guildId, createdAt: Date.now() });
        saveJson(EXPOSED_PATH, exposed);

        const exposeChannel = interaction.guild.channels.cache.get(EXPOSE_CHANNEL_ID);

        const embed = pinkEmbedBase()
          .setTitle('📢 Expose')
          .setDescription(
            `**Usuario:** <@${userId}>\n` +
            `**Tiempo de ban:** ${tiempo}\n` +
            `**Motivo:** ${motivo}\n` +
            `**Autoriza:** <@${interaction.user.id}>`
          );

        if (EXPOSE_LOGO_URL) {
          embed.setThumbnail(EXPOSE_LOGO_URL);
          embed.setFooter({ text: 'Registro Expose', iconURL: EXPOSE_LOGO_URL });
        }

        const looksImg = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
        const looksVid = /\.(mp4|mov|webm)(\?.*)?$/i;

        const files = [];
        if (EXPOSE_BANNER_URL) embed.setImage(EXPOSE_BANNER_URL);

        // ---- link1 = PRUEBAS ----
        if (looksImg.test(link1)) {
          embed.setImage(link1);
        } else if (looksVid.test(link1)) {
          files.push({ attachment: link1, name: 'pruebas.mp4' });
        } else if (link1) {
          embed.addFields({ name: 'Pruebas', value: `[Abrir](${link1})`, inline: false });
        }

        // ---- link2 = CLIP ----
        if (link2) {
          if (looksImg.test(link2)) {
            // Si quieres mantener SIEMPRE el logo, comenta la siguiente línea
            embed.setThumbnail(link2);
          } else if (looksVid.test(link2)) {
            files.push({ attachment: link2, name: 'clip.mp4' });
          } else {
            embed.addFields({ name: 'Clip', value: `[Abrir](${link2})`, inline: true });
          }
        }

        if (exposeChannel) {
          await exposeChannel.send({
            content: '@everyone', // notifica a todos
            embeds: [embed],
            files,
            allowedMentions: { parse: ['users','roles','everyone'] } // asegura el ping global
          });
        }

        await sendLog(interaction, 'EXPOSE', { userId, motivo, tiempo, link1, link2 });
        return interaction.reply({ content: '✅ Expose publicado.', ephemeral: true });
      }
    }

    // --- Comandos ---
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'lista-ban') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES)) {
          return interaction.reply({ content: 'No tienes permiso para usar este comando.', ephemeral: true });
        }
        return sendBansPage(interaction, 0, true);
      }
      if (interaction.commandName === 'lista-exposed') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES)) {
          return interaction.reply({ content: 'No tienes permiso para usar este comando.', ephemeral: true });
        }
        return sendExposePage(interaction, 0, true);
      }

      // ===== NUEVO: /export-registros =====
      if (interaction.commandName === 'export-registros') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES)) {
          return interaction.reply({ content: 'No tienes permiso para exportar registros.', ephemeral: true });
        }
        const bans = loadJson(BANS_PATH);
        const expos = loadJson(EXPOSED_PATH);
        const bansCsv  = buildBansCSV(bans);
        const exposCsv = buildExposedCSV(expos);
        await interaction.reply({
          content: '📦 Exportaciones listas:',
          files: [
            { attachment: Buffer.from(bansCsv, 'utf8'),  name: `bans_${Date.now()}.csv` },
            { attachment: Buffer.from(exposCsv, 'utf8'), name: `exposed_${Date.now()}.csv` }
          ],
          ephemeral: false
        });
        return;
      }
    }
  } catch (err) {
    console.error('Error en interacción:', err);
    try {
      if (interaction.isRepliable()) {
        await interaction.reply({ content: 'Ocurrió un error. Inténtalo de nuevo.', ephemeral: true });
      }
    } catch {}
  }
});

// ===== Enviar panel con !panel-ban =====
client.on(Events.MessageCreate, async (msg) => {
  if (!msg.guild || msg.author.bot) return;
  if (!msg.content.startsWith('!panel-ban')) return;
  if (!hasRole(msg.member, BAN_UNBAN_ROLE_ID)) {
    return msg.reply('No tienes permiso para colocar el panel.');
  }
  await sendControlPanel(msg.channel);
});

client.login(DISCORD_TOKEN);
