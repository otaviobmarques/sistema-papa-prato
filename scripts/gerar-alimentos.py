#!/usr/bin/env python3
"""Gera public/data/alimentos.json (formato compacto) a partir do repositório fontes-ref.

Uso: python3 scripts/gerar-alimentos.py [caminho/para/fontes-ref]
Os números vêm exatamente da fonte; nada é inventado. Itens 'incompleto' e
'inconsistente' ficam de fora do app.
"""
import json, sys, pathlib

raiz = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '../fontes-ref')
dados = json.loads((raiz / 'unificado' / 'alimentos.json').read_text())
resumo = json.loads((raiz / 'unificado' / 'resumo.json').read_text())

FONTES = ['TACO', 'TBCA', 'POF', 'USDA', 'COFID', 'CIQUAL', 'CNF', 'AFCD', 'FRIDA', 'FINELI']

def r(v, casas=1):
    return None if v is None else round(float(v), casas)

saida = []
for a in dados:
    if a.get('uso') != 'ok' or a['fonte'] not in FONTES:
        continue
    p = a['por100g']
    medidas = [[m['nome'], r(m['gramas'])] for m in a.get('medidas', []) if m.get('gramas')]
    termos = ' '.join(a.get('termos') or [])
    saida.append([
        a['id'], a['nome'], FONTES.index(a['fonte']),
        r(p.get('kcal'), 0), r(p.get('proteina')), r(p.get('carboidrato')),
        r(p.get('gordura')), r(p.get('fibra')), r(p.get('sodio_mg'), 0),
        medidas, termos,
    ])

destino = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'data' / 'alimentos.json'
destino.write_text(json.dumps({
    'versao': 1,
    'campos': ['id', 'nome', 'fonte', 'kcal', 'proteina', 'carboidrato', 'gordura', 'fibra', 'sodio_mg', 'medidas', 'termos'],
    'fontes': FONTES,
    'citacao': resumo['citacao'],
    'alimentos': saida,
}, ensure_ascii=False, separators=(',', ':')))
print(f'{len(saida)} alimentos -> {destino} ({destino.stat().st_size/1e6:.1f} MB)')
