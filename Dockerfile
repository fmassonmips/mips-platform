# PassPass Platform — PHP 8.2 + Apache image
#
# Document root is /public so nothing outside it is ever served. The root
# .htaccess is a fallback for shared hosting where DocumentRoot can't be set.
FROM php:8.2-apache

# PDO MySQL driver for MariaDB connectivity.
RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers

# Serve from /public.
ENV APACHE_DOCUMENT_ROOT=/var/www/html/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
    && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Allow .htaccess overrides under the document root.
RUN printf '<Directory ${APACHE_DOCUMENT_ROOT}>\n    AllowOverride All\n    Require all granted\n</Directory>\n' \
    > /etc/apache2/conf-available/passpass.conf \
    && a2enconf passpass

WORKDIR /var/www/html
COPY . /var/www/html

EXPOSE 80
