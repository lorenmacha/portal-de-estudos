# Créditos e licenças de terceiros — versão Web

Esta edição do **Portal de Estudos** é uma aplicação estática executada no navegador. Ela não distribui o antigo backend Python, SQLite, `pypdf`, `youtube-transcript-api` ou as dependências HTTP daquele backend.

## JSZip

A versão Web inclui **JSZip 3.10.1**, usada no navegador para ler contêineres ZIP de formatos como DOCX, PPTX, XLSX e EPUB. O JSZip é distribuído sob licença MIT/GPLv3. Esta distribuição o utiliza sob os termos da licença MIT. A licença incluída está em `assets/JSZIP_LICENSE.txt`.

## PDF.js

A extração de texto de PDFs carrega, sob demanda e pela internet, a distribuição **PDF.js** da Mozilla. PDF.js é distribuído sob licença Apache-2.0. O código do PDF.js não é incorporado neste ZIP; a versão Web referencia a distribuição hospedada em CDN apenas quando o usuário tenta processar um PDF.

## Research Flywheel

**Research Flywheel** (`lidapengpeng/research-flywheel`) foi usado como referência arquitetônica para funcionamento local-first, memória de estudo e pesquisa orientada às próprias fontes. O projeto é MIT. A versão Web implementa seu próprio armazenamento em IndexedDB e LocalStorage.

## FLAMEHAVEN FileSearch

**FLAMEHAVEN FileSearch** (`flamehaven01/Flamehaven-Filesearch`) foi referência para pesquisa BM25, Reciprocal Rank Fusion (RRF), divisão de documentos e atribuição de fontes. O projeto é MIT. A implementação de busca desta edição é executada no navegador.

## Buku

**Buku** (`jarun/buku`) foi usado somente como referência de produto para biblioteca de links, tags, pesquisa e importação/exportação. O Buku é GPL-3.0. **Nenhum código do Buku é incluído**; as funções foram implementadas de forma independente.

## StudyLion / LionBot

**StudyLion/LionBot** (`StudyLions/StudyLion`) foi usado somente como referência de produto para Pomodoro, metas, sequência de estudo, tarefas e estatísticas. **Nenhum código, áudio, imagem ou outro ativo do StudyLion é incluído**; as funções foram reimplementadas de forma independente.

## YouTube Fetcher to Markdown

**YouTube Fetcher to Markdown** (`JimmySadek/youtube-fetcher-to-markdown`) é MIT e foi referência para transformar transcrições em notas Markdown. Nesta edição Web não é distribuído o capturador Python: a transcrição manual e arquivos VTT/SRT são convertidos e indexados diretamente no navegador.

## Local RAG

**Local RAG** (`jonfairbanks/local-rag`) é GPL-3.0 e foi usado apenas como referência de produto para recuperação local de evidências. **Nenhum código do Local RAG é incluído.** O modo “Perguntar aos materiais” desta edição é uma implementação própria, baseada em recuperação e evidências no navegador.

## ChatDocs e AnyChat

**ChatDocs** (`marella/chatdocs`) e **AnyChat** (`shitan198u/AnyChat`) são referências de produto para conversa com documentos e múltiplos formatos. A implementação desta edição é independente e não inclui runtimes ou modelos desses projetos.

## gh-toolkit

**gh-toolkit** (`michael-borck/gh-toolkit`) foi referência para diagnóstico e preparação de publicação. É MIT. O diagnóstico da versão Web é uma implementação própria.

## Full Stack AI Agent Template

**Full Stack AI Agent Template** (`vstorm-co/full-stack-ai-agent-template`) foi referência arquitetônica para separar capacidades em módulos. É MIT. A versão Web não incorpora Next.js, FastAPI, PostgreSQL, Redis, Milvus ou outros componentes do template.