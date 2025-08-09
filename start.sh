# 1. Iniciar ngrok em segundo plano e capturar o domínio público
 echo "Iniciando ngrok e obtendo domínio público..."
 nohup ngrok http 3000 --request-header-add ngrok-skip-browser-warning:true > ngrok.log 2>&1 &
 sleep 5 # Dar um tempo para o ngrok iniciar e gerar o túnel

# 2. Tentar obter o domínio público do ngrok
#NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -oP '"public_url":"\K[^"\/]+')
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | jq -r ".tunnels[0].public_url" )

if [ -z "$NGROK_URL" ]; then
    echo "Erro: Não foi possível obter o domínio público do ngrok. Verifique o log do ngrok para mais detalhes."
        exit 1
        fi

        echo "Domínio público do ngrok: $NGROK_URL"

# 3. Substituir AUDIO_BASE_URL no arquivo .env com o novo domínio
        echo "Atualizando .env com o novo domínio para AUDIO_BASE_URL..."
        sed -i "s|^AUDIO_BASE_URL=.*|AUDIO_BASE_URL=${NGROK_URL}/audios|" /root/axenianode/.env

# 4. Enviar a URL do ngrok para o endpoint remoto
        echo "Enviando URL do ngrok para https://axeniabot.com.br/cron/ngrok_domain.php"
        curl -G --data-urlencode "url=$NGROK_URL" "https://axeniabot.com.br/cron/ngrok_domain.php"

# 5. Iniciar a aplicação Node.js
        echo "Iniciando a aplicação Node.js..."
        cd /root/axenianode
        pm2 start index.js --name axenianode --watch
        pm2 logs axenianode
        echo "Configuração concluída! O domínio público é: $NGROK_URL"
# 6. Reinicia sessões anteriores
        echo "Reiniciando sessões anteriores com https://axeniabot.com.br/cron/node_sessions.php"
        curl -G --data-urlencode "verify=xangrile" "https://axeniabot.com.br/cron/node_sessions.php"
