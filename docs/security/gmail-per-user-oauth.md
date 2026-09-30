# Gmail por usuario para órdenes de compra

Cada Manager autoriza una cuenta Google independiente para enviar órdenes de compra. La autorización no inicia sesión en WMS y el servicio nunca usa una cuenta remitente global como sustituto. OAuth usa Authorization Code con PKCE S256, `state` ligado a la sesión y `access_type=offline`; los scopes solicitados se limitan a `openid`, `email` y `https://www.googleapis.com/auth/gmail.send`.

## Configuración de servidor

Definir estos valores únicamente en el entorno seguro del servidor, sin agregarlos a archivos versionados:

- `GOOGLE_GMAIL_CLIENT_ID` y `GOOGLE_GMAIL_CLIENT_SECRET`: credenciales del cliente OAuth web de Google.
- `GOOGLE_GMAIL_REDIRECT_URI`: URI HTTPS exacta registrada en Google Cloud y coincidente con el callback de la aplicación.
- `GMAIL_TOKEN_ENCRYPTION_KEY`: clave dedicada de 32 bytes codificada como 64 caracteres hexadecimales. Guardarla en el gestor de secretos de despliegue. Su rotación requiere una migración/re-cifrado coordinado de las conexiones almacenadas.

El refresh token se cifra con AES-256-GCM y AAD que incluye usuario y versión. La base de datos almacena el sobre cifrado versionado; claves o tokens nunca deben aparecer en logs, errores, UI ni snapshots de compra. Ante `invalid_grant`, la conexión cambia a `REAUTH_REQUIRED` y el envío se detiene hasta que ese mismo usuario vuelva a autorizarla.

El servicio vincula la renovación al correo seleccionado para la OC. Si el Manager reconecta otra cuenta antes de renovar, se rechaza el intento antes de contactar Google. La comprobación final de estado, correo y sobre cifrado impide devolver un token si la conexión cambia durante la renovación. La desconexión deshabilita primero los envíos locales y elimina sólo el grant que se revoca, preservando una reconexión concurrente.

## Preparación de Google Cloud

Configurar la pantalla de consentimiento OAuth, agregar únicamente los usuarios de prueba durante la validación y registrar el redirect URI exacto. Antes de habilitar Managers externos en producción, revisar en Google Cloud el estado de publicación, verificación de marca y requisitos de verificación aplicables al scope de Gmail. `gmail.send` permite enviar correo y debe tratarse como un permiso sensible; la revisión vigente de Google prevalece sobre esta nota.

La integración obtiene la identidad de `https://openidconnect.googleapis.com/v1/userinfo` y exige `sub`, correo y `email_verified=true`. Nunca confiar en un email enviado por el navegador como prueba de identidad. Referencias oficiales: [OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenID Connect UserInfo](https://developers.google.com/identity/openid-connect/reference), [scopes OAuth de Google](https://developers.google.com/identity/protocols/oauth2/scopes) y [preparación para producción](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).
