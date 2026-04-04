const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuração do upload de imagens
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public', 'imagens');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const nomeLimpo = path.basename(file.originalname, ext).toLowerCase().replace(/[^a-z0-9]/g, '');
        cb(null, `${nomeLimpo}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        cb(null, allowed.includes(file.mimetype));
    }
});

// ==================== FUNÇÕES PARA GITHUB ====================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'BertoB6/Zona-backend';
const GITHUB_PATH = process.env.GITHUB_PATH || 'dados/jogos.json';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

async function lerDadosDoGitHub() {
    try {
        const response = await fetch(GITHUB_API, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        if (response.status === 404) {
            // Arquivo não existe, criar padrão
            const dadosPadrao = {
                ultimaAtualizacao: new Date().toISOString(),
                ordemJogos: [],
                jogos: []
            };
            await salvarDadosNoGitHub(dadosPadrao);
            return dadosPadrao;
        }
        
        const data = await response.json();
        const conteudo = Buffer.from(data.content, 'base64').toString('utf8');
        return JSON.parse(conteudo);
    } catch (error) {
        console.error('Erro ao ler do GitHub:', error);
        return { ultimaAtualizacao: new Date().toISOString(), ordemJogos: [], jogos: [] };
    }
}

async function salvarDadosNoGitHub(dados) {
    if (!GITHUB_TOKEN) {
        console.error('GITHUB_TOKEN não configurado');
        return false;
    }
    
    dados.ultimaAtualizacao = new Date().toISOString();
    const conteudo = Buffer.from(JSON.stringify(dados, null, 2)).toString('base64');
    
    // Primeiro, obter o SHA do arquivo atual (se existir)
    let sha = null;
    try {
        const getResponse = await fetch(GITHUB_API, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        if (getResponse.status === 200) {
            const fileData = await getResponse.json();
            sha = fileData.sha;
        }
    } catch (e) {}
    
    // Salvar/atualizar arquivo
    const response = await fetch(GITHUB_API, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: `Atualizar jogos - ${new Date().toISOString()}`,
            content: conteudo,
            sha: sha
        })
    });
    
    return response.status === 200 || response.status === 201;
}

// ==================== ROTAS ====================

// Upload de imagem
app.post('/api/upload', upload.single('imagem'), (req, res) => {
    if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem' });
    const nome = req.file.filename.replace(/\.[^/.]+$/, '');
    res.json({ sucesso: true, nomeImagem: nome });
});

// Buscar todos os jogos
app.get('/api/jogos', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        res.json(dados);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao ler dados' });
    }
});

// Adicionar novo jogo
app.post('/api/jogos', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        const novoJogo = req.body;
        const ids = dados.jogos.map(j => j.id);
        const novoId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        novoJogo.id = novoId;
        dados.jogos.push(novoJogo);
        dados.ordemJogos.push(novoId);
        await salvarDadosNoGitHub(dados);
        res.status(201).json(novoJogo);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao adicionar jogo' });
    }
});

// Atualizar jogo
app.put('/api/jogos/:id', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        const id = parseInt(req.params.id);
        const index = dados.jogos.findIndex(j => j.id === id);
        if (index === -1) return res.status(404).json({ erro: 'Jogo não encontrado' });
        dados.jogos[index] = { ...req.body, id };
        await salvarDadosNoGitHub(dados);
        res.json(dados.jogos[index]);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar jogo' });
    }
});

// Remover jogo
app.delete('/api/jogos/:id', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        const id = parseInt(req.params.id);
        dados.jogos = dados.jogos.filter(j => j.id !== id);
        dados.ordemJogos = dados.ordemJogos.filter(i => i !== id);
        await salvarDadosNoGitHub(dados);
        res.json({ mensagem: 'Jogo removido' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover jogo' });
    }
});

// Atualizar ordem
app.put('/api/ordem', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        dados.ordemJogos = req.body.ordemJogos;
        await salvarDadosNoGitHub(dados);
        res.json({ mensagem: 'Ordem atualizada' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar ordem' });
    }
});

// Atualizar avaliação
app.put('/api/avaliacao/:id', async (req, res) => {
    try {
        const dados = await lerDadosDoGitHub();
        const jogo = dados.jogos.find(j => j.id === parseInt(req.params.id));
        if (jogo) {
            jogo.avaliacao = req.body.avaliacao;
            await salvarDadosNoGitHub(dados);
            res.json(jogo);
        } else {
            res.status(404).json({ erro: 'Jogo não encontrado' });
        }
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar avaliação' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📊 Salvando dados no GitHub: ${GITHUB_REPO}`);
});
