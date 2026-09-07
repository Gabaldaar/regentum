import { NextResponse } from 'next/server';

// --- Configuration ---
const API_BASE_URL = (process.env.FINANCE_API_BASE_URL || 'https://gestionomiscuentas.web.app').replace(/\/$/, '');

export async function GET(request: Request) {
  try {
    const externalApiUrl = `${API_BASE_URL}/api/datos-imputacion`;
    const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';

    if (!FINANCE_API_KEY) {
        console.error('[FINANCE PROXY] No FINANCE_API_KEY found in environment variables.');
        return NextResponse.json(
            { error: "La API Key de finanzas no está configurada en las variables de entorno del servidor (FINANCE_API_KEY)." }, 
            { 
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                }
            }
        );
    }

    const headersForExternalApi = {
      'Authorization': `Bearer ${FINANCE_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(externalApiUrl, {
      method: 'GET',
      headers: headersForExternalApi,
      cache: 'no-store',
    });

    if (!response.ok) {
      let errorBody = 'La API de finanzas devolvió un error.';
      try {
        const errorJson = await response.json();
        errorBody = errorJson.error || errorJson.message || JSON.stringify(errorJson);
      } catch (e) {}
      throw new Error(`Error ${response.status}: ${errorBody}`);
    }
    
    const data = await response.json();
    
    // Devolvemos la respuesta con headers de CORS
    return NextResponse.json(data, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido en el servidor proxy.';
    console.error('[FINANCE PROXY ERROR]', errorMessage);
    return NextResponse.json(
      { error: `Error en el proxy interno: ${errorMessage}` },
      { 
        status: 500,
        headers: {
            'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
}

export async function POST(request: Request) {
  try {
    const FINANCE_API_KEY = process.env.FINANCE_API_KEY || '';

    if (!FINANCE_API_KEY) {
        console.error('[FINANCE PROXY POST] No FINANCE_API_KEY found in environment variables.');
        return NextResponse.json(
            { error: "La API Key de finanzas no está configurada en las variables de entorno del servidor (FINANCE_API_KEY)." }, 
            { 
                status: 500,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                }
            }
        );
    }

    const body = await request.json();
    const externalApiUrl = `${API_BASE_URL}/api/registrar-cobro`;

    console.log("[FINANCE PROXY POST] Sending payload to external API:", externalApiUrl, JSON.stringify(body));

    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FINANCE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const resText = await response.text();

    if (!response.ok) {
      console.error(`[FINANCE PROXY POST ERROR] Status ${response.status}: ${resText}`);
      return NextResponse.json(
        { error: `Error de la API externa (${response.status}): ${resText}` },
        { 
          status: response.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    let resData;
    try {
      resData = JSON.parse(resText);
    } catch (e) {
      resData = { message: resText };
    }

    return NextResponse.json(resData, {
        status: 201,
        headers: {
            'Access-Control-Allow-Origin': '*',
        }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido en el servidor proxy.';
    console.error('[FINANCE PROXY POST EXCEPTION]', errorMessage);
    return NextResponse.json(
      { error: `Error en el proxy interno: ${errorMessage}` },
      { 
        status: 500,
        headers: {
            'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
}


export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
