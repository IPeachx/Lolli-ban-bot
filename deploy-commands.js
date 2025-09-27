import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder } from 'discord.js';

const {
  DISCORD_TOKEN,
  CLIENT_ID,
  GUILD_ID,
} = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Faltan variables en el .env (DISCORD_TOKEN, CLIENT_ID, GUILD_ID)');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('lista-ban')
    .setDescription('Muestra la lista de baneos registrados (no ephemeral).'),

  new SlashCommandBuilder()
    .setName('lista-exposed')
    .setDescription('Muestra la lista de usuarios expuestos (no ephemeral).'),

  new SlashCommandBuilder()
    .setName('export-registros')
    .setDescription('Exporta todos los registros a CSV para descargar.')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log('Registrando comandos...');
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands },
  );
  console.log('✅ Comandos registrados.');
} catch (err) {
  console.error('Error registrando comandos:', err);
  process.exit(1);
}
