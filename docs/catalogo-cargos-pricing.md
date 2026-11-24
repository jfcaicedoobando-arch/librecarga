# Catálogo Único de Cargos — Módulo de Pricing (Libre Carga)

Versión 1.0 · 23-nov-2026 · Borrador para revisión de Pricing, Operaciones y Fiscal

## 0. Por qué un catálogo propio

No existe un único catálogo de cargos que cubra marítimo, aéreo, terrestre y aduana:

- **UN/CEFACT Recomendación 23 (Freight Cost Code, FCC)** es el estándar de la ONU para nombrar fletes y recargos. Usa un código numérico de 6 dígitos en 3 niveles (categoría 1 dígito → subgrupo 2 → detalle 3) y es el que usan los mensajes EDIFACT (p. ej. `TCC+101021::6`). Es útil para intercambio EDI, pero es poco legible para usuarios.
- **Aéreo:** IATA define los *Other Charges Codes* de la guía aérea (Resolución 600a / TACT Rules 6.2.19), de 2 letras (AW, MY, RA…). Son obligatorios en la e-AWB (FWB/FHL), y algunas aerolíneas agregan códigos propios.
- **Marítimo:** no hay estándar obligatorio; cada naviera usa sus abreviaturas (BAS, BAF, LSS, PSS, THC…) y el mismo concepto puede tener varios códigos.
- **Terrestre:** existen códigos de accesorios (ANSI X12) en EE. UU., pero en México cada transportista usa su nomenclatura.

**Propuesta:** un catálogo interno único (este documento) con un código propio legible, y columnas de mapeo hacia el código de industria (IATA para aéreo, abreviatura naviera para marítimo) y, opcionalmente, hacia UN/CEFACT Rec. 23 para EDI.

---

## 1. Estructura de cada cargo (campos del catálogo)

| Campo | Descripción | Ejemplo |
|---|---|---|
| `codigo` | Código interno único: `GRUPO-CONCEPTO` | `SUR-BAF` |
| `nombre_es` | Nombre visible en cotización | Recargo por combustible marítimo |
| `nombre_en` | Nombre en inglés (para agentes) | Bunker Adjustment Factor |
| `grupo` | Grupo (sección 2) | SUR |
| `modos` | M (marítimo), A (aéreo), T (terrestre), F (ferroviario), X (todos) | M |
| `submodo` | FCL / LCL / FTL / LTL / Drayage / todos | FCL, LCL |
| `etapa` | ORI (origen), FLT (flete principal), DES (destino), ADU (aduana), GEN (general) | FLT |
| `base_default` | Base de cálculo por defecto (sección 3) | CNT |
| `codigo_industria` | Código IATA o abreviatura común de naviera/transportista | BAF |
| `alias` | Otros códigos con que llega el mismo concepto | BUC, MFR, SBF |
| `cod_unece` | Código UN/CEFACT Rec. 23 (opcional, para EDI) | — |
| `clave_sat` | Clave de producto/servicio CFDI (validar con Fiscal) | — |
| `iva` | Tratamiento de IVA por defecto (validar con Fiscal) | — |
| `aplica_margen` | Si el vendedor puede aplicar margen | Sí |
| `visible_cliente` | Si aparece desglosado en la cotización | Sí |
| `activo` | Activo / inactivo | Sí |

**Línea de cargo en una tarifa o cotización** (lo que captura Pricing): `codigo` + proveedor + base de cálculo + monto unitario + mínimo + máximo + moneda + cantidad + prepaid/collect + incluido en flete (Sí/No) + vigencia + notas.

---

## 2. Grupos

| Grupo | Nombre | Incluye |
|---|---|---|
| FRT | Flete principal | Flete base marítimo, aéreo, terrestre, ferroviario |
| SUR | Recargos de flete | Combustible, ambientales, divisas, temporada, riesgo, canales |
| TER | Terminal y manejo | THC, handling aeroportuario, CFS, maniobras portuarias |
| DOC | Documentación | BL, AWB, manifiestos, emisión, corrección |
| SEC | Seguridad | ISPS, screening, sellos, custodia |
| EQP | Equipo | Contenedor especial, reposicionamiento, limpieza, alquiler |
| TMP | Tiempos y estadías | Demoras, detención, almacenaje, estadías de camión |
| SPC | Carga especial | Peligrosa, refrigerada, sobredimensionada, valiosa, animales |
| INL | Terrestre y accesorios | Pick-up, delivery, drayage, paradas, maniobras, liftgate |
| CUS | Aduana | Honorarios, pedimento, impuestos, previo, revalidación |
| INS | Seguro | Seguro de mercancía |
| ADM | Administrativos y financieros | Comisión, cobro collect, desembolsos, cargos bancarios |
| OTH | Otros | Cargos misceláneos aprobados |

---

## 3. Bases de cálculo

| Código | Base | Uso típico |
|---|---|---|
| CNT | Por contenedor (por tipo) | Flete FCL, THC, BAF |
| TEU | Por TEU | BAF de algunas navieras |
| WM | Por W/M (1 t = 1 m³, el mayor) | Flete y recargos LCL |
| CBM | Por metro cúbico | CFS, desconsolidación |
| TON | Por tonelada | Sobrepeso, carga general |
| KGT | Por kg tasable | Flete aéreo, FSC aéreo |
| KGB | Por kg bruto | FSC/SSC según aerolínea |
| BL | Por BL (master o house) | Emisión BL, revalidación |
| AWB | Por guía aérea (MAWB/HAWB) | AWB fee, desglose |
| SHP | Por embarque | Pre-alerta, coordinación |
| ENT | Por pedimento / entrada aduanal | Honorarios, validación |
| PCT | Porcentaje sobre otro cargo o valor | CAF, FSC terrestre, seguro |
| UNI | Por unidad de transporte (camión) | Flete FTL, cruce |
| PLT | Por tarima / posición | Flete LTL |
| KM | Por kilómetro / milla | Flete terrestre por distancia |
| HR | Por hora | Detención de camión, maniobras |
| DIA | Por día | Demoras, almacenaje, estadía |
| PZA | Por pieza / bulto | Etiquetado, handling por pieza |
| UNN | Por número UN (DG) | Cargo por mercancía peligrosa aérea |
| FIX | Monto fijo | Cargos únicos |

Cada línea guarda también **mínimo** y, si aplica, **máximo**.

---

## 4. Catálogo de cargos

Columnas: **Código** · **Concepto** · **Modos** · **Etapa** · **Base** · **Cód. industria / alias**

### 4.1 FRT — Flete principal

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| FRT-OF | Flete marítimo base (Ocean Freight) | M (FCL/LCL) | FLT | CNT / WM | BAS, OFT, SEA, O/F |
| FRT-AF | Flete aéreo base (Air Freight) | A | FLT | KGT | Tarifa por rango de peso (MIN, N, +45…) |
| FRT-LH | Flete terrestre base (Linehaul) | T (FTL/LTL) | FLT | UNI / KM / PLT | Linehaul |
| FRT-RL | Flete ferroviario base | F | FLT | CNT / UNI | — |
| FRT-PRE | Pre-acarreo / precarriage naviera (inland origen) | M | ORI | CNT | TAO, ACO (arbitrary/feeder origen) |
| FRT-ONC | On-carriage naviera (inland destino) | M | DES | CNT | TAD, ACD |
| FRT-FDR | Flete feeder / transbordo | M | FLT | CNT | Feeder freight |
| FRT-GRI | Incremento general de tarifa | M | FLT | CNT | GRI / GRR |
| FRT-CHT | Flete chárter | A, M | FLT | FIX | Charter |

### 4.2 SUR — Recargos de flete

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| SUR-BAF | Recargo por combustible marítimo | M | FLT | CNT / TEU / WM | BAF, BUC, MFR, SBF |
| SUR-EBS | Recargo de combustible de emergencia | M | FLT | CNT | EBS, FAF, BRC, OBS |
| SUR-LSS | Recargo por combustible bajo en azufre | M | FLT | CNT | LSS, ECA, CLS |
| SUR-ETS | Recargo por emisiones UE (EU ETS) | M | FLT | CNT | ETS, EUIS |
| SUR-CAF | Ajuste por tipo de cambio | M | FLT | PCT | CAF |
| SUR-PSS | Recargo de temporada alta | M, A | FLT | CNT / KGT | PSS |
| SUR-PCS | Recargo por congestión portuaria | M | FLT | CNT | PCS, CON |
| SUR-EIS | Desbalance de equipo / reposicionamiento de vacíos | M | FLT | CNT | EIS, CIC, POS |
| SUR-WRS | Recargo por riesgo de guerra / contingencia | M | FLT | CNT | WRS, WAR, ERS, CSU |
| SUR-CAN | Peaje de canal (Panamá / Suez) | M | FLT | CNT | PCS, PCT, PAN, SCC, SUZ |
| SUR-HCA | Adicional High Cube / reefer / tanque | M | FLT | CNT | HCA |
| SUR-WIN | Recargo de invierno | M | FLT | CNT | WSU, WTR, WIN |
| SUR-DPS | Recargo por puerto seco / ICD | M | DES | CNT | DPS |
| SUR-IFS | Recargo de combustible inland | M | DES | CNT | IFS |
| SUR-FSA | Recargo por combustible aéreo | A | FLT | KGT / KGB | MY (IATA) |
| SUR-FST | Recargo por combustible terrestre | T | FLT | PCT / KM | FSC |
| SUR-OWT | Sobrepeso de contenedor | M | FLT | CNT | OWS, HWS, OWC |

### 4.3 TER — Terminal y manejo

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| TER-THO | Manejo en terminal origen | M | ORI | CNT / WM | OTHC, THC |
| TER-THD | Manejo en terminal destino | M | DES | CNT / WM | DTHC, THC |
| TER-WHF | Muellaje / uso de puerto | M | ORI / DES | CNT / TON | Wharfage |
| TER-CFO | CFS origen (consolidación LCL) | M (LCL) | ORI | WM | CFS |
| TER-CFD | CFS destino / desconsolidación LCL | M (LCL) | DES | WM / CBM | CFS, Devanning |
| TER-HDO | Handling aeroportuario origen (GHA) | A | ORI | KGT / AWB | Terminal handling |
| TER-HDD | Handling aeroportuario destino (GHA) | A | DES | KGT / AWB | Terminal handling |
| TER-ULD | Armado / paletizado de ULD | A | ORI | AWB / PZA | AS (Assembly service fee) |
| TER-MAN | Maniobras en recinto fiscal | M, A | DES | CNT / TON | Maniobras |
| TER-VGM | Pesaje VGM (SOLAS) | M | ORI | CNT | VGM |
| TER-SCN | Escaneo / revisión no intrusiva | M, T | ORI / DES | CNT | — |

### 4.4 DOC — Documentación

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| DOC-BL | Emisión de BL | M | ORI | BL | DOC, BL fee |
| DOC-BLD | Emisión / liberación de BL en destino | M | DES | BL | DDC, D/O fee |
| DOC-SWB | Express release / Sea Waybill | M | ORI | BL | Telex release |
| DOC-COR | Corrección de BL / AWB | M, A | GEN | BL / AWB | AW (cambio de AWB, según aerolínea) |
| DOC-AWB | Emisión de guía aérea (MAWB/HAWB) | A | ORI | AWB | AW (IATA) |
| DOC-MFT | Manifiesto anticipado (AMS, ISF, ENS, ACI…) | M, A | ORI | BL / AWB | AMS, ENS, ACI |
| DOC-EDI | Transmisión electrónica de datos aduanales | A, M | ORI | AWB / BL | CG (IATA) |
| DOC-CPT | Emisión Carta Porte / CMR / CRT | T | ORI | UNI | — |
| DOC-CER | Certificados (origen, fitosanitario…) | X | ORI | FIX | — |
| DOC-DSG | Desglose de guías house | A, M | DES | AWB / BL | — |

### 4.5 SEC — Seguridad

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| SEC-ISP | Cargo de seguridad portuaria (ISPS) | M | ORI / DES | CNT | ISPS, CSF, TSC |
| SEC-SCA | Recargo de seguridad / screening aéreo | A | ORI | KGT / KGB | SC o XB según aerolínea |
| SEC-XRY | Inspección rayos X / ETD en origen | A | ORI | KGB / AWB | — |
| SEC-SEL | Sello / candado de alta seguridad | M, T | ORI | CNT / UNI | Seal fee |
| SEC-CUS | Custodia armada / escolta | T | FLT | UNI / KM | — |
| SEC-GPS | Monitoreo GPS adicional | T | FLT | UNI | — |

### 4.6 EQP — Equipo

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| EQP-SPE | Adicional por equipo especial (OT, FR, tanque) | M | FLT | CNT | Special equipment premium |
| EQP-SOC | Contenedor propiedad del embarcador | M | FLT | CNT | SOC |
| EQP-CLN | Limpieza de contenedor | M | DES | CNT | Cleaning fee |
| EQP-DMG | Daño / reparación de contenedor | M | DES | CNT | Damage recovery |
| EQP-CHS | Uso de chasis | M, T | DES | DIA / CNT | CUC, CSS |
| EQP-GEN | Genset (reefer en carretera) | T, M | FLT | DIA / UNI | Genset |
| EQP-ACT | Contenedor activo con temperatura (farma) | A | FLT | FIX | Renta contenedor activo |
| EQP-PKG | Embalaje / empaque | X | ORI | PZA / FIX | PK (IATA) |

### 4.7 TMP — Tiempos, estadías y almacenaje

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| TMP-DEM | Demoras (contenedor dentro de terminal) | M | ORI / DES | DIA | Demurrage, DEM |
| TMP-DET | Detención (contenedor fuera de terminal) | M | ORI / DES | DIA | Detention, DET |
| TMP-STM | Almacenaje en recinto portuario / CFS | M | DES | DIA / CBM | Storage |
| TMP-STA | Almacenaje en terminal aérea (GHA) | A | DES | DIA / KGB | Storage |
| TMP-TDT | Detención de camión (horas de espera) | T | ORI / DES | HR | TDT, Detention |
| TMP-LAY | Pernocta / layover | T | ORI / DES | DIA | Layover |
| TMP-FFL | Falso flete (camión no utilizado) | T | ORI | UNI | TONU |
| TMP-WHS | Almacenaje en bodega propia / cross-dock | X | ORI / DES | DIA / PLT | Storage in transit, STR |

### 4.8 SPC — Carga especial

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| SPC-IMO | Adicional por mercancía peligrosa (IMDG) | M | FLT | CNT | IMO, DG surcharge |
| SPC-DGA | Cargo por mercancía peligrosa aérea (IATA DGR) | A | ORI | UNN / AWB | RA (IATA) |
| SPC-HZT | Adicional Hazmat terrestre | T | FLT | UNI | Hazmat |
| SPC-RFR | Adicional reefer / control de temperatura | M, A, T | FLT | CNT / KGT / UNI | — |
| SPC-OOG | Adicional fuera de medidas (OOG / sobredimensionado) | M, T | FLT | CNT / UNI | OOG |
| SPC-PRM | Permiso de sobredimensión / sobrepeso carretero | T | FLT | FIX | — |
| SPC-AVI | Animales vivos (contenedor, acompañante) | A | ORI | FIX / PZA | AC, AT, LA (IATA) |
| SPC-HUM | Restos humanos | A | ORI | FIX | HR (IATA) |
| SPC-VAL | Carga valiosa / alto valor | A, T | FLT | PCT / FIX | — |
| SPC-PER | Perecederos / cadena de frío | A | ORI | KGT | — |

### 4.9 INL — Terrestre y accesorios

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| INL-PUP | Pick UP | X | ORI | UNI / KGT / PLT | PU (IATA) |
| INL-DLV | Delivery | X | DES | UNI / KGT / PLT | Delivery |
| INL-DRY | Arrastre de contenedor puerto–destino (drayage) | T (drayage) | DES / ORI | CNT | Drayage |
| INL-RVC | Retorno de contenedor vacío | T (drayage) | DES | CNT | Empty return |
| INL-FUL | Adicional "full" (dos contenedores, un tracto) | T (drayage) | DES | UNI | — |
| INL-XBR | Cruce fronterizo / transfer | T | FLT | UNI | Transfer, Drayage de puente |
| INL-STP | Parada adicional | T | FLT | FIX | Stop-off, Drop |
| INL-LMP | Maniobras de carga/descarga (lumper) | T | ORI / DES | UNI / HR | Lumper |
| INL-LFT | Rampa hidráulica (liftgate) | T | ORI / DES | FIX | Liftgate |
| INL-APP | Entrega con cita / horario especial | T | DES | FIX | Appointment |
| INL-RES | Entrega residencial / zona restringida | T | DES | FIX | Residential |
| INL-INS | Entrega dentro de instalaciones | T | DES | FIX | Inside delivery |
| INL-TOL | Casetas / peajes | T | FLT | UNI / FIX | Tolls |
| INL-DIV | Desvío / cambio de destino | T | FLT | FIX | Diversion |
| INL-RAMP | Arrastre a/desde rampa ferroviaria | F, T | ORI / DES | CNT | — |

### 4.10 CUS — Aduana

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| CUS-HON | Honorarios agente aduanal | X | ADU | ENT / PCT | — |
| CUS-EXP | Despacho de exportación (origen) | X | ORI | ENT | CH (IATA, clearance & handling origen) |
| CUS-IMP | Despacho de importación (destino) | X | DES | ENT | CD (IATA, clearance & handling destino) |
| CUS-VAL | Validación / prevalidación de pedimento | X | ADU | ENT | — |
| CUS-DTA | Derecho de Trámite Aduanero (DTA) — pago por cuenta del cliente | X | ADU | ENT | — |
| CUS-IGI | Impuesto General de Importación — pago por cuenta del cliente | X | ADU | ENT | — |
| CUS-IVA | IVA de importación — pago por cuenta del cliente | X | ADU | ENT | — |
| CUS-PRE | Reconocimiento previo | X | DES | ENT / FIX | — |
| CUS-REV | Revalidación de BL / liberación | M | DES | BL | — |
| CUS-INP | Inspección física / reconocimiento aduanero | X | ADU | FIX | — |
| CUS-OVT | Tiempo extra de autoridad | X | ADU | HR | CI (IATA, overtime) |
| CUS-BND | Fianza / tránsito in-bond | T | FLT | ENT | Customs bond |
| CUS-USB | Agente aduanal en EE. UU. (customs broker) | T | ADU | ENT | — |

> Los cargos CUS-DTA, CUS-IGI y CUS-IVA son **pagos por cuenta del cliente**: no llevan margen y se facturan como reembolso, no como servicio.

### 4.11 INS — Seguro

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| INS-CGO | Seguro de mercancía | X | GEN | PCT (sobre valor) | IN (IATA, insurance premium) |

### 4.12 ADM — Administrativos y financieros

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| ADM-HDL | Handling / coordinación del forwarder | X | GEN | SHP | Handling fee |
| ADM-CCF | Cargo por flete collect | X | DES | PCT | FC (IATA, charges collect fee) |
| ADM-DSB | Cargo por desembolso / anticipo | X | GEN | PCT | DB (IATA, disbursement fee) |
| ADM-BNK | Cargo bancario | X | GEN | PCT / FIX | Banking charge |
| ADM-AGT | Comisión / profit share de agente | X | GEN | SHP / PCT | — |
| ADM-CAN | Cancelación o cambio de booking | X | GEN | FIX | — |

### 4.13 OTH — Otros

| Código | Concepto | Modos | Etapa | Base | Cód. industria / alias |
|---|---|---|---|---|---|
| OTH-MCC | Misceláneo debido al transportista | X | GEN | FIX | MC (IATA, due carrier) |
| OTH-MCA | Misceláneo debido al agente | X | GEN | FIX | MA (IATA, due agent) |
| OTH-GTX | Impuesto gubernamental (origen/destino extranjero) | X | GEN | FIX | GT (IATA) |

> Usar OTH sólo con aprobación de Pricing. Si un cargo OTH se repite, debe darse de alta como cargo propio.

---

## 5. Reglas del catálogo

1. **Un concepto = un código.** Los códigos de navieras, aerolíneas y transportistas se guardan como `alias` y se mapean al código interno al cargar tarifarios.
2. **El código interno no se reutiliza.** Un cargo dado de baja queda `inactivo`, nunca se borra (lo usan cotizaciones históricas).
3. **Aéreo exige código IATA.** Todo cargo con modo A que vaya a la e-AWB debe tener `codigo_industria` IATA. En la guía, el código de 2 letras lleva un sufijo C (due carrier) o A (due agent), p. ej. `AWC`, `MYC`, `AWA`.
4. **Recargos "incluidos".** Si la naviera da tarifa *all-in*, el recargo se registra con monto 0 y `incluido = Sí`, para saber qué cubre el flete.
5. **Base de cálculo editable por línea**, con la del catálogo como sugerencia (p. ej. FSC aéreo por kg bruto o por kg tasable según aerolínea).
6. **Pagos por cuenta del cliente** (impuestos, DTA, derechos) se marcan para que no lleven margen ni IVA de servicio.
7. **Alta de cargos nuevos:** sólo Pricing (o un administrador) puede crear códigos; los vendedores eligen del catálogo.

---

## 6. Datos fiscales (pendiente de validar con Fiscal)

Cada cargo debe mapearse a una clave de producto/servicio del CFDI. Claves de transporte confirmadas en fuentes SAT o de proveedores de facturación:

| Clave SAT | Descripción |
|---|---|
| 78101800 | Transporte de carga por carretera |
| 78101801 | Transporte de carga por carretera (en camión) en área local |
| 78101802 | Transporte de carga por carretera (en camión) a nivel nacional |
| 78101806 | Transporte de carga por carretera a nivel internacional |
| 78101600 | Transporte de carga por ferrocarril |
| 78121500 / 78121501 | Empaque / Contenedorización de mercancías |

Pendiente que Fiscal asigne clave a flete marítimo, flete aéreo, servicios de agente de carga, despacho aduanal, almacenaje y seguro, y el tratamiento de IVA de cada uno (incluida la retención en autotransporte y la tasa aplicable a transporte internacional).

---

## 7. Preguntas abiertas

- ¿Se usará UN/CEFACT Rec. 23 para EDI con algún cliente o naviera? Si no, el campo `cod_unece` puede quedar vacío.
- ¿Los cargos se mostrarán al cliente desglosados o agrupados (origen / flete / destino / aduana)?
- ¿Qué cargos de destino cobran los agentes en el extranjero y cómo se reflejan (en moneda local o en USD)?
- ¿Ferrocarril tendrá cargos propios (rampa, almacenaje en terminal intermodal) o se reutilizan los de terrestre?

---

## Fuentes

- [UN/CEFACT Recommendation 23 — Freight Cost Code (UN Digital Library)](https://digitallibrary.un.org/record/93370)
- [Rec. 23, revisión 6 — estructura de códigos](https://digitallibrary.un.org/record/635515/files/%5BE_%5DECE_TRADE_C_CEFACT_2008_30-EN.pdf)
- [GS1 EANCOM IFCSUM — uso de Rec. 23 en EDI](https://gs1.org/sites/gs1/files/docs/eancom/ean02s4/part2/ifcsum/0511.htm)
- [IATA Other Charge codes (TACT Rules 6.2.19)](https://dokumen.tips/documents/iata-other-charge-r-egulation-other-charge-r-egulation-iata-tact-rules-62-19other.html)
- [Códigos de Other Charges en la AWB](http://www.ejc56.com/News/DetailPage-13419.html)
- [CHAMP Cargospot — códigos IATA más comunes (AW, MY, SC, RA)](https://wb-cargospot-mt-prod-r1.champ.aero/cargo_wb/resources/help/webhelp/airline_user_guide/airline/Concepts/Other_local_charges.html)
- [Cathay Cargo — e-AWB SOP, códigos de cargos](https://www.cathaycargo.com/Portals/0/Docs/e-AWB%20SOP%20for%20Freight%20Forwarder%20(Station)%20V3%20-%2014Jun16.pdf)
- [Riege — códigos IATA y códigos propios de aerolínea](https://service.riege.com/en/knowledge/how-can-i-set-up-airline-specific-other-charge-codes)
- [Xeneta — lista de recargos marítimos y sus códigos (jul-2025)](https://www.xeneta.com/hubfs/static/surcharge-list.pdf)
- [Maersk — definiciones de recargos](https://www.maersk.com/support/glossaries/surcharge-definition)
- [FMC — abreviaturas de transporte marítimo](https://webarchive.library.unt.edu/web/20130219200408/http://www.fmc.gov/questions/abbreviations__acronyms.aspx)
- [IBM Sterling — códigos de cargos y accesorios (ANSI)](https://www.ibm.com/support/pages/node/752571)
- [SAT — Carta Porte, clave 78101800](https://www.sat.gob.mx/minisitio/CartaPorte/documentos/07CartaPorte.pdf)
- [Edifact México — claves SAT para transporte de carga](https://www.edifact.com.mx/masinfo/claves-del-sat-para-transporte-de-carga)
