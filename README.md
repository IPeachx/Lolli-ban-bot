# Ban + Expose Bot (rosa claro)

Bot listo para:
- Panel con botones **Ban**, **Unban**, **Buscar** y **Expose** (con modales).
- Embeds rosa claro, envíos a canales específicos y **logs** detallados.
- Comandos **/lista-ban** y **/lista-exposed** con **paginación**, no ephemeral, y solo para 3 roles.
- Opción (apagada por defecto) para **banear/desbanear realmente** en el servidor.

## Requisitos
- Node.js 18+
- Crear una aplicación/bot en el Portal de Discord y obtener `DISCORD_TOKEN`.
- Dar permisos de `applications.commands`, `bot`, y **Message Content** opcional.
- Invitar el bot con permisos de **Ban Members** si activarás los baneos reales.

## Instalación
```bash
npm i
cp .env.example .env
# Edita .env con tus IDs y token
npm run deploy   # registra /lista-ban y /lista-exposed en tu GUILD_ID
npm start
```

## Variables `.env`
- `DISCORD_TOKEN` = token del bot
- `CLIENT_ID` = id de la app
- `GUILD_ID` = servidor para registrar slash commands
- `ACTIONS_CHANNEL_ID` = canal donde se publican los embeds de **Ban/Unban**
- `EXPOSE_CHANNEL_ID` = canal donde se publican los **Expose**
- `LOGS_CHANNEL_ID` = canal de **logs**
- `BAN_UNBAN_ROLE_ID` = **un solo rol** con permiso para usar **Ban/Unban** y colocar el panel con `!panel-ban`
- `LISTS_ROLE_IDS` = **hasta 3 roles** (separados por comas) que pueden usar `/lista-ban` y `/lista-exposed`
- `APPLY_GUILD_BANS` = `true` para banear/desbanear realmente; por defecto `false` (solo registro)

## Uso
1) En el canal donde quieras, escribe `!panel-ban` (debe usarlo alguien con el rol de `BAN_UNBAN_ROLE_ID`) para enviar el **panel**.
2) Usa **Ban/Unban** para registrar acciones (y opcionalmente aplicarlas de verdad si `APPLY_GUILD_BANS=true`).
3) **Buscar**: pide **ID de usuario** y te devuelve su historial (respuesta privada).
4) **Expose**: pide ID, motivo, tiempo y **2 enlaces** (imagen/clip).
   - En el embed público **no** se muestra el ID, sólo el **tag** del usuario y el **usuario que autoriza** (quien hace la acción).
   - Si el enlace es imagen directa, se previsualiza con `setImage`.
5) **/lista-ban** y **/lista-exposed**: listados con **paginación** (botones Anterior/Siguiente), **no ephemeral**, para los roles configurados.

## Datos
- Se guardan en `./data/bans.json` y `./data/exposed.json`.
- Si deseas migrar, puedes editar estos archivos o respaldarlos.

## Notas
- Los **logs** incluyen IDs para auditoría interna.
- Puedes estilizar más los embeds editando `pinkEmbedBase()`.
- El comando de búsqueda es **ephemeral** por privacidad; si lo quieres público, cambia `ephemeral: true` a `false` en `modal_buscar`.
