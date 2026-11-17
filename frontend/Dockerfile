# Espace usager (HTML/CSS/JS statique) servi par nginx.
# Le navigateur appelle directement le BFF sur http://localhost:3000/api (voir js/api.js).
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY pages/ /usr/share/nginx/html/pages/

EXPOSE 80
