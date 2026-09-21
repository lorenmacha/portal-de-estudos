# Portal de Estudos — Site Web

Esta é a edição **100% web** do Portal de Estudos. Não é necessário abrir `server.py`, `abrir-portal.bat` ou manter um servidor Python para usar o núcleo do portal. O estado pessoal fica no próprio navegador usando **LocalStorage + IndexedDB**.

## O que funciona diretamente no site

- seis guias com 1.679 checkboxes, progresso e retomada do último ponto;
- Favoritos, recentes, Revisar, Dominado e notas por seção;
- histórico de sessões de estudo;
- busca local no navegador com BM25/RRF sobre guias, materiais e links;
- Biblioteca de materiais em PDF, DOCX, PPTX, XLSX, EPUB, HTML, Markdown, TXT, CSV/TSV, JSON, RTF, VTT e SRT;
- biblioteca de links com tags, fixação, busca, associação a disciplinas e importação/exportação;
- Pomodoro, metas semanais, sequência de estudo e tarefas;
- “Perguntar aos materiais” em **modo evidência**, com trechos e fontes recuperados localmente;
- transcrição manual de aulas do YouTube e importação de VTT/SRT como notas pesquisáveis;
- backup e restauração, incluindo o conteúdo dos materiais salvos no IndexedDB;
- funcionamento offline do shell e dos guias após o primeiro carregamento em HTTPS, via Service Worker.

## Limitações da hospedagem estática

Duas funções do antigo backend local não podem ser reproduzidas integralmente por um site estático no GitHub Pages: **captura automática de legendas do YouTube** e **geração de respostas pelo Ollama**. A primeira continua disponível pelo fluxo manual/VTT/SRT; o assistente continua funcionando no modo de recuperação/evidência. Importar páginas por URL depende da política CORS do site de origem.

Para PDFs, a extração de texto carrega PDF.js pela internet na primeira utilização. Depois, os materiais processados ficam armazenados no navegador.

## Dados e privacidade

Os dados ficam associados ao **navegador + domínio** em que o portal é aberto. Eles não são sincronizados automaticamente entre computador e celular. Use **Exportar backup** para migrar ou proteger progresso, notas, materiais, links, tarefas e demais dados e **Restaurar backup** no outro navegador.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub.
2. Coloque **todo o conteúdo desta pasta na raiz do repositório**, na branch `main`.
3. O workflow `.github/workflows/pages.yml` incluído publica o site automaticamente pelo GitHub Actions.
4. Em **Settings → Pages**, deixe GitHub Actions como fonte caso o GitHub peça essa configuração.

O arquivo `.nojekyll` já está incluído. O site foi preparado para funcionar tanto na raiz quanto em um subcaminho do GitHub Pages.

## Uso local para testes

Abrir `index.html` diretamente pode funcionar para partes do portal, mas Service Worker e alguns recursos de navegador exigem HTTP/HTTPS. Para teste local, use qualquer servidor estático, por exemplo `python -m http.server 8000`, e abra `http://127.0.0.1:8000/`.

## Manual

Abra `MANUAL-DE-USO.html` para o manual específico desta edição Web.

## Créditos

Consulte `THIRD_PARTY_NOTICES.md` e `assets/JSZIP_LICENSE.txt`.
