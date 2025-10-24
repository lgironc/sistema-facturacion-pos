# Imagen base de Node
FROM node:20

# Carpeta de trabajo
WORKDIR /app

# Copiar archivos de configuración
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del proyecto
COPY . .

# Puerto del servidor
EXPOSE 3000

# Comando para iniciar el servidor
CMD ["npm", "run", "dev"]
