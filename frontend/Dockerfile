FROM nginx:1.27-alpine

# 기본 설정을 정적 파일 전용 설정으로 교체
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY index.html app.js style.css /usr/share/nginx/html/

EXPOSE 80
