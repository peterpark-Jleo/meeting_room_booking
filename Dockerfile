# Build and run the application
FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Explicitly exclude local node_modules if they exist
RUN rm -rf node_modules

# Reinstall production deps cleanly inside the container
RUN npm install --production

# Build environment variables (can be overridden at runtime)
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port
EXPOSE 8080

# Start command
CMD [ "npm", "start" ]
