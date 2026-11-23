# Vitrine de vendas multi-segmento

Cópia do site da Topper Imobiliária, transformada num sistema que serve para qualquer ramo de vendas.
O site original da imobiliária continua separado e não foi alterado.

## Trocar de empresa (sem mexer no código)
Entre em `#admin` > **Empresa e segmento** e troque:
- **Nome**, **CNPJ** (validado), razão social, WhatsApp, e-mail, endereço, cidade, horário;
- **Segmento**: o que a empresa vende (hoje: *Carros e motos* ou *Imóveis*);
- **Cores da marca** (ou "usar as cores padrão do segmento").

Salvou, o site inteiro muda: menus, filtros, ficha técnica, formulários, textos, ícone do app e título nas buscas.
Os anúncios de cada segmento ficam guardados separados; voltar ao segmento anterior traz os anúncios de volta.

`public/config.json` tem só os valores iniciais. O que for salvo no painel vale mais.

## Criar um segmento novo (ex.: máquinas agrícolas, móveis, barcos)
Copie `public/segmentos/veiculos.json` com outro nome e ajuste:
- `item`: como se chama o que se vende (singular/plural);
- `tipos`: categorias, cada uma com o prefixo do código (ex.: `CR` gera CR-01, CR-02...);
- `campos`: a ficha técnica. Para cada campo: `tipo` (texto, numero, select, bool), `card` (aparece no cartão),
  `filtro` (select, min, max, check), `tipos` (só para algumas categorias), `ordem` (vira opção de ordenação);
- `extras`: lista de itens marcáveis (opcionais, diferenciais);
- `condicoes`: financiamento, troca, permuta...;
- `textos`: frases da página inicial, do "Venda o seu" e dos botões;
- `cores` e `fonteTitulo`: identidade padrão do segmento.
Se quiser anúncios de exemplo, crie `public/data/exemplos-<id>.json`. O segmento aparece sozinho no painel.

## Rodar no computador
```
ADMIN_SENHA=uma-senha-forte node server.js
```
Abra http://localhost:3000. Painel em http://localhost:3000/#admin. Demonstração sem servidor: `?demo` no endereço.

## Variáveis
| Nome | Para quê |
|---|---|
| `ADMIN_SENHA` | senha do painel (obrigatória) |
| `SEGREDO` | texto aleatório longo; mantém o login válido entre reinícios |
| `DATA_DIR` | pasta dos dados quando não há bucket |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_KEY`, `S3_SECRET` | bucket onde ficam anúncios, contatos, fotos e configuração |
| `SEM_EXEMPLOS` | `1` para não carregar anúncios de exemplo |
| `PORT` | porta (padrão 3000) |

## Backup
Tudo que muda fica no bucket (ou em `DATA_DIR`): `itens.json`, `leads.json`, `config.json` e `uploads/` (fotos).
