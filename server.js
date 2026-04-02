const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== ÚNICA COISA QUE MUDA ==========
// Antes: app.use(cors());
// Agora: apenas permite seu front-end
app.use(cors({
    origin: 'https://zonaxp.vercel.app'
}));
// ==========================================

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
        const nomeSemExt = path.basename(file.originalname, ext);
        const nomeLimpo = nomeSemExt.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nomeFinal = `${nomeLimpo}${ext}`;
        cb(null, nomeFinal);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Formato não suportado. Use JPG, PNG ou WEBP'));
        }
    }
});

// Caminho do arquivo JSON
const dadosPath = path.join(__dirname, 'dados', 'jogos.json');

function lerDados() {
    try {
        const dados = fs.readFileSync(dadosPath, 'utf8');
        return JSON.parse(dados);
    } catch (error) {
        const dadosPadrao = {
            ultimaAtualizacao: new Date().toISOString(),
            ordemJogos: [],
            jogos: []
        };
        fs.writeFileSync(dadosPath, JSON.stringify(dadosPadrao, null, 2));
        return dadosPadrao;
    }
}

function salvarDados(dados) {
    dados.ultimaAtualizacao = new Date().toISOString();
    fs.writeFileSync(dadosPath, JSON.stringify(dados, null, 2));
}

// ==================== ROTAS ====================

app.post('/api/upload', upload.single('imagem'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ erro: 'Nenhuma imagem enviada' });
    }
    const nomeImagem = req.file.filename.replace(/\.[^/.]+$/, '');
    res.json({ 
        sucesso: true, 
        nomeImagem: nomeImagem,
        arquivo: req.file.filename 
    });
});

app.get('/api/jogos', (req, res) => {
    try {
        const dados = lerDados();
        res.json(dados);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao ler dados' });
    }
});

app.get('/api/jogos/:id', (req, res) => {
    try {
        const dados = lerDados();
        const jogo = dados.jogos.find(j => j.id === parseInt(req.params.id));
        if (!jogo) return res.status(404).json({ erro: 'Jogo não encontrado' });
        res.json(jogo);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao ler dados' });
    }
});

app.post('/api/jogos', (req, res) => {
    try {
        const dados = lerDados();
        const novoJogo = req.body;
        const ids = dados.jogos.map(j => j.id);
        const novoId = ids.length > 0 ? Math.max(...ids) + 1 : 1;
        novoJogo.id = novoId;
        dados.jogos.push(novoJogo);
        dados.ordemJogos.push(novoId);
        salvarDados(dados);
        res.status(201).json(novoJogo);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao adicionar jogo' });
    }
});

app.put('/api/jogos/:id', (req, res) => {
    try {
        const dados = lerDados();
        const id = parseInt(req.params.id);
        const index = dados.jogos.findIndex(j => j.id === id);
        if (index === -1) return res.status(404).json({ erro: 'Jogo não encontrado' });
        const jogoAtualizado = { ...req.body, id };
        dados.jogos[index] = jogoAtualizado;
        salvarDados(dados);
        res.json(jogoAtualizado);
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar jogo' });
    }
});

app.delete('/api/jogos/:id', (req, res) => {
    try {
        const dados = lerDados();
        const id = parseInt(req.params.id);
        dados.jogos = dados.jogos.filter(j => j.id !== id);
        dados.ordemJogos = dados.ordemJogos.filter(i => i !== id);
        salvarDados(dados);
        res.json({ mensagem: 'Jogo removido com sucesso' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao remover jogo' });
    }
});

app.put('/api/ordem', (req, res) => {
    try {
        const dados = lerDados();
        dados.ordemJogos = req.body.ordemJogos;
        salvarDados(dados);
        res.json({ mensagem: 'Ordem atualizada' });
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar ordem' });
    }
});

app.put('/api/avaliacao/:id', (req, res) => {
    try {
        const dados = lerDados();
        const id = parseInt(req.params.id);
        const { avaliacao } = req.body;
        const jogo = dados.jogos.find(j => j.id === id);
        if (jogo) {
            jogo.avaliacao = avaliacao;
            salvarDados(dados);
            res.json(jogo);
        } else {
            res.status(404).json({ erro: 'Jogo não encontrado' });
        }
    } catch (error) {
        res.status(500).json({ erro: 'Erro ao atualizar avaliação' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`📁 Admin: http://localhost:${PORT}/admin.html`);
    console.log(`📊 API: http://localhost:${PORT}/api/jogos`);
});
