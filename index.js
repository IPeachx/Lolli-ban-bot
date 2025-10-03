// index.js
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events
} from 'discord.js';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';

/* ===================== Persistencia (Railway) ===================== */
const DATA_DIR = process.env.DATA_DIR || '/app/data';
fse.ensureDirSync(DATA_DIR);

const BANS_PATH    = path.join(DATA_DIR, 'bans.json');
const EXPOSED_PATH = path.join(DATA_DIR, 'exposed.json');

// crea archivos vacíos si no existen
for (const p of [BANS_PATH, EXPOSED_PATH]) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, '[]', 'utf8');
}

const readJSON  = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } };
const writeJSON = (p, data) => fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');

/* ========================= Variables ENV ========================= */
const {
  DISCORD_TOKEN,
  ACTIONS_CHANNEL_ID,
  EXPOSE_CHANNEL_ID,
  LOGS_CHANNEL_ID,
  BAN_UNBAN_ROLE_ID,
  LISTS_ROLE_IDS,
  APPLY_GUILD_BANS,

  // Imágenes
  PANEL_LOGO_URL,
  PANEL_BANNER_URL,
  EXPOSE_LOGO_URL,
  EXPOSE_BANNER_URL
} = process.env;

const LISTS_ROLES = (LISTS_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const APPLY_REAL_BANS = (APPLY_GUILD_BANS || 'false').toLowerCase() === 'true';

/* ========================= Cliente Discord ======================== */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

/* ======================== Helpers y estilos ======================= */
const pinkEmbedBase = () =>
  new EmbedBuilder()
    .setColor(0xF19EC2) // rosa claro
    .setTimestamp();

const ok = s => `✅ ${s}`;
const no = s => `❌ ${s}`;

function addPanelBranding(embed) {
  if (PANEL_LOGO_URL)   embed.setThumbnail(PANEL_LOGO_URL);
  if (PANEL_BANNER_URL) embed.setImage(PANEL_BANNER_URL);
  return embed;
}
function addExposeBranding(embed, useBanner = true) {
  if (EXPOSE_LOGO_URL) embed.setThumbnail(EXPOSE_LOGO_URL);
  if (useBanner && EXPOSE_BANNER_URL) embed.setImage(EXPOSE_BANNER_URL);
  return embed;
}

function hasAnyRole(member, roleIdOrList) {
  if (!member) return false;
  const ids = Array.isArray(roleIdOrList) ? roleIdOrList : [roleIdOrList];
  return ids.some(id => member.roles?.cache?.has(id));
}

async function sendLog(interaction, action, data = {}) {
  try {
    const ch = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
    if (!ch) return;

    const embed = pinkEmbedBase()
      .setTitle(`📒 Log: ${action}`)
      .setDescription(
        Object.entries(data).map(([k, v]) => `**${k}:** ${String(v)}`).join('\n') || '_Sin datos_'
      )
      .setFooter({ text: `Por: ${interaction.user.tag} (${interaction.user.id})` });

    addPanelBranding(embed);
    await ch.send({ embeds: [embed] });
  } catch (e) {
    console.warn('No se pudo enviar log:', e.message);
  }
}

function tagOf(userOrMember) {
  const u = userOrMember?.user ?? userOrMember;
  return u ? `<@${u.id}>` : 'N/A';
}

async function resolveUser(guild, raw) {
  raw = (raw || '').trim();

  // mención <@id>
  const mentionId = raw.match(/^<@!?(\d+)>$/)?.[1];
  if (mentionId) {
    try { const m = await guild.members.fetch(mentionId); return { member: m, user: m.user }; } catch {}
  }
  // solo ID
  if (/^\d{16,20}$/.test(raw)) {
    try { const m = await guild.members.fetch(raw); return { member: m, user: m.user }; } catch {}
  }
  // username/tag
  const found = guild.members.cache.find(m =>
    (m.user.tag && m.user.tag.toLowerCase() === raw.toLowerCase()) ||
    (m.user.username && m.user.username.toLowerCase() === raw.toLowerCase())
  );
  if (found) return { member: found, user: found.user };

  return { member: null, user: null };
}

/* ======================= Embeds específicos ======================= */
function buildBanEmbed({ targetTag, tiempo, motivo, autorizaTag, ticket }) {
  const embed = pinkEmbedBase()
    .setTitle('⛔ Ban aplicado')
    .setDescription(
      [
        `**Usuario:** ${targetTag}`,
        `**Tiempo:** ${tiempo}`,
        `**Ticket:** ${ticket}`,
        '',
        `**Motivo:** ${motivo}`,
        '',
        `**Autoriza:** ${autorizaTag}`,
      ].join('\n')
    );
  addPanelBranding(embed);
  return embed;
}

function buildUnbanEmbed({ targetTag, motivo, autorizaTag, ticket }) {
  const embed = pinkEmbedBase()
    .setTitle('🍀 Unban aplicado')
    .setDescription(
      [
        `**Usuario:** ${targetTag}`,
        `**Ticket:** ${ticket}`,
        '',
        `**Motivo:** ${motivo}`,
        '',
        `**Autoriza:** ${autorizaTag}`,
      ].join('\n')
    );
  addPanelBranding(embed);
  return embed;
}

function buildExposeEmbed({ targetTag, tiempo, motivo, autorizaTag, link1, link2 }) {
  const embed = pinkEmbedBase()
    .setTitle('📢 Exposed')
    .setDescription(
      [
        `**Usuario:** ${targetTag}`,
        `**Tiempo de ban:** ${tiempo}`,
        `**Motivo:** ${motivo}`,
        `**Staff:** ${autorizaTag}`,
      ].join('\n')
    );

  // Decide si usamos banner de marca o imagen de prueba
  const isImg = /\.(png|jpe?g|gif|webp)$/i.test(link1);
  if (isImg) {
    // Si el link1 es imagen, lo mostramos como imagen grande
    embed.setImage(link1);
    addExposeBranding(embed, false); // no ponemos banner para no tapar la prueba
  } else {
    // Si no es imagen, dejamos banner y agregamos links clickeables
    addExposeBranding(embed, true);
  }

  return embed;
}

/* ============================ Panel =============================== */
async function sendControlPanel(channel) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_ban').setLabel('Ban').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_unban').setLabel('Unban').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_buscar').setLabel('Buscar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_expose').setLabel('Expose').setStyle(ButtonStyle.Secondary),
  );

  const embed = pinkEmbedBase()
    .setTitle('**PANEL DE BANEO**')
    .setDescription(
      [
        'Este panel ha sido diseñado para centralizar y registrar todas las acciones importantes relacionadas con la moderación del servidor.',
        '',
        '**Funciones disponibles:**',
        '• **Ban:** Aplica un baneo con motivo, tiempo y autorización, dejando constancia en el registro oficial.',
        '• **Unban:** Retira un baneo con la misma transparencia, especificando motivo y autorización.',
        '• **Buscar:** Permite consultar el historial de baneos y exposiciones de un usuario.',
        '• **Expose:** Publica información y evidencia (imágenes o clips) sobre casos relevantes con fines informativos.',
        '',
        '> Todos los movimientos quedan guardados en el canal de logs para garantizar un seguimiento completo y seguro.'
      ].join('\n')
    );

  addPanelBranding(embed);
  await channel.send({ embeds: [embed], components: [row1] });
}

/* ======================= Modales (UI) ========================= */
function buildBanModal() {
  return new ModalBuilder()
    .setCustomId('modal_ban')
    .setTitle('Aplicar BAN')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (mención o ID)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo del ban').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_tiempo').setLabel('Tiempo de ban (ej. 7 días / Permanente)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_ticket').setLabel('Ticket / Caso').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_autoriza').setLabel('Usuario que autoriza (mención)').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}
function buildUnbanModal() {
  return new ModalBuilder()
    .setCustomId('modal_unban')
    .setTitle('Aplicar UNBAN')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (mención o ID)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo de Unban').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_ticket').setLabel('Ticket / Caso').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_autoriza').setLabel('Usuario que autoriza (mención)').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}
function buildSearchModal() {
  return new ModalBuilder()
    .setCustomId('modal_search')
    .setTitle('Buscar historial de usuario')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (mención / ID / tag)').setStyle(TextInputStyle.Short).setRequired(true)
      )
    );
}
function buildExposeModal() {
  return new ModalBuilder()
    .setCustomId('modal_expose')
    .setTitle('Expose usuario')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_user').setLabel('Usuario (mención o ID)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_motivo').setLabel('Motivo de ban / Expose').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_tiempo').setLabel('Tiempo de ban (o N/A)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_link1').setLabel('Pruebas (Gif URL)').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('m_link2').setLabel('Clip (URL del clip en MP4)').setStyle(TextInputStyle.Short).setRequired(false)
      )
    );
}

/* ===================== Panel por mensaje ===================== */
client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;

    if (message.content.trim().toLowerCase() === '!panel-ban') {
      if (!ACTIONS_CHANNEL_ID || message.channel.id !== ACTIONS_CHANNEL_ID) {
        return message.reply({ content: no('Este comando solo puede usarse en el canal configurado de acciones.'), allowedMentions: { repliedUser: false } });
      }
      await sendControlPanel(message.channel);
      await message.react('🩷');
    }
  } catch (e) {
    console.error('Error en MessageCreate:', e);
  }
});

/* ================== Interactions: botones/modales/slash ================== */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    /* ---------- Botones ---------- */
    if (interaction.isButton()) {
      if (!interaction.guild) return;

      switch (interaction.customId) {
        case 'btn_ban':
          if (!hasAnyRole(interaction.member, BAN_UNBAN_ROLE_ID) && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: no('No tienes permiso para Ban.'), ephemeral: true });
          }
          await interaction.showModal(buildBanModal());
          return;

        case 'btn_unban':
          if (!hasAnyRole(interaction.member, BAN_UNBAN_ROLE_ID) && !interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: no('No tienes permiso para Unban.'), ephemeral: true });
          }
          await interaction.showModal(buildUnbanModal());
          return;

        case 'btn_buscar':
          await interaction.showModal(buildSearchModal());
          return;

        case 'btn_expose':
          await interaction.showModal(buildExposeModal());
          return;
      }
    }

    /* ---------- Modales ---------- */
    if (interaction.isModalSubmit()) {
      // ===== BAN =====
      if (interaction.customId === 'modal_ban') {
        const rawUser = interaction.fields.getTextInputValue('m_user');
        const motivo  = interaction.fields.getTextInputValue('m_motivo');
        const tiempo  = interaction.fields.getTextInputValue('m_tiempo');
        const ticket  = interaction.fields.getTextInputValue('m_ticket');
        const autor   = interaction.fields.getTextInputValue('m_autoriza');

        const { member: targetMember, user: targetUser } = await resolveUser(interaction.guild, rawUser);
        if (!targetUser) return interaction.reply({ content: no('No pude resolver el usuario.'), ephemeral: true });

        const autoriza = await resolveUser(interaction.guild, autor);
        const autorizaTag = autoriza.user ? tagOf(autoriza.user) : autor;
        const targetTag   = tagOf(targetUser);

        if (APPLY_REAL_BANS && targetMember) {
          try { await targetMember.ban({ reason: `[${ticket}] ${motivo}` }); } catch {}
        }

        const actionsCh = interaction.guild.channels.cache.get(ACTIONS_CHANNEL_ID);
        if (!actionsCh) return interaction.reply({ content: no('Canal de acciones no configurado.'), ephemeral: true });

        const embed = buildBanEmbed({ targetTag, tiempo, motivo, autorizaTag, ticket });
        const sent = await actionsCh.send({ embeds: [embed] });

        const bans = readJSON(BANS_PATH);
        bans.push({
          userId: targetUser.id,
          userTag: targetUser.tag,
          tiempo, motivo, ticket,
          autoriza: autorizaTag,
          messageId: sent.id,
          channelId: actionsCh.id,
          createdAt: Date.now()
        });
        writeJSON(BANS_PATH, bans);

        await sendLog(interaction, 'BAN', { usuario: targetTag, tiempo, motivo, ticket, autoriza: autorizaTag, msg: sent.url });
        return interaction.reply({ content: ok('Ban publicado.'), ephemeral: true });
      }

      // ===== UNBAN =====
      if (interaction.customId === 'modal_unban') {
        const rawUser = interaction.fields.getTextInputValue('m_user');
        const motivo  = interaction.fields.getTextInputValue('m_motivo');
        const ticket  = interaction.fields.getTextInputValue('m_ticket');
        const autor   = interaction.fields.getTextInputValue('m_autoriza');

        const { user: targetUser } = await resolveUser(interaction.guild, rawUser);
        if (!targetUser) return interaction.reply({ content: no('No pude resolver el usuario.'), ephemeral: true });

        const autoriza = await resolveUser(interaction.guild, autor);
        const autorizaTag = autoriza.user ? tagOf(autoriza.user) : autor;
        const targetTag   = tagOf(targetUser);

        if (APPLY_REAL_BANS) {
          try { await interaction.guild.members.unban(targetUser.id, `[${ticket}] ${motivo}`); } catch {}
        }

        // Borrar mensaje del ban (si existe en registros)
        const bans = readJSON(BANS_PATH);
        const lastBan = [...bans].reverse().find(b => b.userId === targetUser.id);
        if (lastBan?.messageId && lastBan?.channelId) {
          try {
            const ch = interaction.guild.channels.cache.get(lastBan.channelId);
            if (ch) {
              const msg = await ch.messages.fetch(lastBan.messageId).catch(() => null);
              if (msg) await msg.delete();
              await sendLog(interaction, 'BAN_ELIMINADO', {
                usuario: targetTag, ticket: lastBan.ticket || ticket,
                referencia: `${lastBan.channelId}/${lastBan.messageId}`
              });
            }
          } catch (e) {
            console.warn('No se pudo borrar el mensaje de BAN:', e.message);
          }
        }

        // Notificar unban SOLO a logs
        const embed = buildUnbanEmbed({ targetTag, motivo, autorizaTag, ticket });
        const logsCh = interaction.guild.channels.cache.get(LOGS_CHANNEL_ID);
        if (logsCh) await logsCh.send({ embeds: [embed] });

        await sendLog(interaction, 'UNBAN', { usuario: targetTag, motivo, ticket, autoriza: autorizaTag });
        return interaction.reply({ content: ok('Unban registrado y ban previo eliminado (si existía).'), ephemeral: true });
      }

      // ===== BUSCAR =====
      if (interaction.customId === 'modal_search') {
        const rawUser = interaction.fields.getTextInputValue('m_user');
        const { user: targetUser } = await resolveUser(interaction.guild, rawUser);
        const userId = targetUser?.id || rawUser;

        const bans = readJSON(BANS_PATH).filter(b => b.userId === userId || b.userTag?.toLowerCase() === rawUser.toLowerCase());
        const exps = readJSON(EXPOSED_PATH).filter(e => e.userId === userId || e.userTag?.toLowerCase() === rawUser.toLowerCase());

        const embed = pinkEmbedBase()
          .setTitle(`🔎 Historial de ${targetUser ? targetUser.tag : rawUser}`)
          .setDescription(
            [
              `**Bans:** ${bans.length}`,
              `**Exposed:** ${exps.length}`,
              '',
              '**Últimos movimientos:**',
              ...bans.slice(-3).map(b => `• Ban: ${b.motivo} (${b.tiempo}) [${b.ticket}]`),
              ...exps.slice(-3).map(e => `• Expose: ${e.motivo} (${e.tiempo})`)
            ].join('\n') || '_Sin registros_'
          );

        addPanelBranding(embed);
        return interaction.reply({ embeds: [embed], ephemeral: true });
      }

      // ===== EXPOSE =====
      if (interaction.customId === 'modal_expose') {
        const rawUser = interaction.fields.getTextInputValue('m_user');
        const motivo  = interaction.fields.getTextInputValue('m_motivo');
        const tiempo  = interaction.fields.getTextInputValue('m_tiempo');
        const link1   = interaction.fields.getTextInputValue('m_link1');
        const link2   = interaction.fields.getTextInputValue('m_link2') || '';

        const { user: targetUser } = await resolveUser(interaction.guild, rawUser);
        if (!targetUser) return interaction.reply({ content: no('No pude resolver el usuario.'), ephemeral: true });

        const autorizaTag = tagOf(interaction.user);
        const targetTag   = tagOf(targetUser);

        const embed = buildExposeEmbed({ targetTag, tiempo, motivo, autorizaTag, link1, link2 });

        // Campos de “Pruebas” y “Clip”
        const isImg1 = /\.(png|jpe?g|gif|webp)$/i.test(link1);
        const isVid1 = /\.(mp4|mov|webm)$/i.test(link1);
        if (!isImg1) {
          // si no es imagen (video u otro), lo dejamos como link
          embed.addFields({ name: 'Pruebas', value: `[Abrir](${link1})`, inline: true });
        }

        if (link2) {
          const isVid2 = /\.(mp4|mov|webm)$/i.test(link2);
          const isImg2 = /\.(png|jpe?g|gif|webp)$/i.test(link2);
          if (isImg2 || isVid2) embed.addFields({ name: 'Clip', value: `[Abrir](${link2})`, inline: true });
          else embed.addFields({ name: 'Clip', value: `[Abrir](${link2})`, inline: true });
        }

        const exposeCh = interaction.guild.channels.cache.get(EXPOSE_CHANNEL_ID);
        if (!exposeCh) return interaction.reply({ content: no('Canal de expose no configurado.'), ephemeral: true });

        const content = '@everyone';
        const sent = await exposeCh.send({
          content,
          embeds: [embed],
          allowedMentions: { parse: ['everyone', 'users', 'roles'] }
        });

        const exps = readJSON(EXPOSED_PATH);
        exps.push({
          userId: targetUser.id,
          userTag: targetUser.tag,
          motivo, tiempo,
          link1, link2,
          messageId: sent.id,
          channelId: exposeCh.id,
          autoriza: autorizaTag,
          createdAt: Date.now()
        });
        writeJSON(EXPOSED_PATH, exps);

        await sendLog(interaction, 'EXPOSE', { usuario: targetTag, motivo, tiempo, link1, link2, msg: sent.url });
        return interaction.reply({ content: ok('Expose publicado.'), ephemeral: true });
      }
    }

    /* ---------- Slash Commands ---------- */
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;

      if (name === 'lista-ban') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES) && !interaction.member.permissions.has('Administrator')) {
          return interaction.reply({ content: no('No tienes permiso para usar este comando.'), ephemeral: true });
        }
        const bans = readJSON(BANS_PATH);
        const embed = pinkEmbedBase().setTitle(`📄 Lista de bans (${bans.length})`);
        addPanelBranding(embed);
        const lines = bans.slice(-20).reverse().map(b =>
          `• ${b.userTag || b.userId} — **${b.tiempo}** — ${b.motivo} [${b.ticket || 's/ticket'}]`
        );
        embed.setDescription(lines.join('\n') || '_Sin registros_');
        return interaction.reply({ embeds: [embed] });
      }

      if (name === 'lista-exposed') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES) && !interaction.member.permissions.has('Administrator')) {
          return interaction.reply({ content: no('No tienes permiso para usar este comando.'), ephemeral: true });
        }
        const exps = readJSON(EXPOSED_PATH);
        const embed = pinkEmbedBase().setTitle(`📄 Lista de exposed (${exps.length})`);
        addExposeBranding(embed);
        const lines = exps.slice(-20).reverse().map(e =>
          `• ${e.userTag || e.userId} — ${e.motivo} (${e.tiempo})`
        );
        embed.setDescription(lines.join('\n') || '_Sin registros_');
        return interaction.reply({ embeds: [embed] });
      }

      if (name === 'export-registros') {
        if (!hasAnyRole(interaction.member, LISTS_ROLES) && !interaction.member.permissions.has('Administrator')) {
          return interaction.reply({ content: no('No tienes permiso para usar este comando.'), ephemeral: true });
        }

        const bans = readJSON(BANS_PATH);
        const exps = readJSON(EXPOSED_PATH);

        const esc = (s) => String(s ?? '').replaceAll('"','""');
        const bansCsv =
          'type,userId,userTag,tiempo,motivo,ticket,autoriza,createdAt\n' +
          bans.map(b => `ban,"${esc(b.userId)}","${esc(b.userTag)}","${esc(b.tiempo)}","${esc(b.motivo)}","${esc(b.ticket)}","${esc(b.autoriza)}","${b.createdAt}"`).join('\n');
        const expsCsv =
          'type,userId,userTag,tiempo,motivo,link1,link2,autoriza,createdAt\n' +
          exps.map(e => `expose,"${esc(e.userId)}","${esc(e.userTag)}","${esc(e.tiempo)}","${esc(e.motivo)}","${esc(e.link1)}","${esc(e.link2)}","${esc(e.autoriza)}","${e.createdAt}"`).join('\n');

        const allCsv = bansCsv + '\n' + expsCsv + '\n';
        const fileName = `registros_${Date.now()}.csv`;
        return interaction.reply({ files: [{ attachment: Buffer.from(allCsv, 'utf8'), name: fileName }] });
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

/* ======================== Ready & login ======================== */
client.once(Events.ClientReady, (c) => {
  console.log(ok(`Conectado como ${c.user.tag}`));
});

client.login(DISCORD_TOKEN);
