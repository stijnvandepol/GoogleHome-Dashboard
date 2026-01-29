FROM nginx:alpine

# Gooi jouw HTML/JS/CSS in de standaard nginx webroot
COPY ./html/ /usr/share/nginx/html

# Nginx template with KNMI proxy (envsubst on container start)
COPY ./nginx/default.conf.template /etc/nginx/templates/default.conf.template
