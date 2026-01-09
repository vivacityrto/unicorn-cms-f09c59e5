/**
 * TGA (Training.gov.au) SOAP Service Endpoints
 * 
 * Source of truth for TGA Web Services URLs.
 * Per TGA Web Services Specification v13r1.
 * 
 * IMPORTANT:
 * - All services use 'Webservices' (lowercase 's')
 * - All services use V13 suffix (e.g., OrganisationServiceV13.svc)
 */

export type TGAEnvironment = 'prod' | 'production' | 'sandbox';

export interface TGAEndpoints {
  organisation: string;
  training: string;
  classification: string;
}

// Hardcoded V13 endpoints - DO NOT use string building that could drop V13
const TGA_PROD_ENDPOINTS: TGAEndpoints = {
  organisation: 'https://ws.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc',
  training: 'https://ws.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc',
  classification: 'https://ws.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc',
};

const TGA_SANDBOX_ENDPOINTS: TGAEndpoints = {
  organisation: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/OrganisationServiceV13.svc',
  training: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc',
  classification: 'https://ws.sandbox.training.gov.au/Deewr.Tga.Webservices/ClassificationServiceV13.svc',
};

/**
 * Get TGA SOAP service endpoints for the specified environment.
 * 
 * @param env - 'prod' or 'production' for production, 'sandbox' for testing
 * @returns Object with organisation, training, and classification URLs (all with V13.svc)
 */
export function getTgaEndpoints(env: TGAEnvironment = 'prod'): TGAEndpoints {
  const isProduction = env === 'prod' || env === 'production';
  return isProduction ? TGA_PROD_ENDPOINTS : TGA_SANDBOX_ENDPOINTS;
}

/**
 * TGA V13 namespace for SOAP actions per WSDL
 */
export const TGA_V13_NAMESPACE = 'http://training.gov.au/services/13/';

/**
 * SOAP Action URIs for TGA services.
 * These use the V13 namespace with interface-style names.
 */
export const TGA_SOAP_ACTIONS = {
  // Organisation service operations
  getOrganisationDetails: `${TGA_V13_NAMESPACE}IOrganisationService/GetOrganisation`,
  searchOrganisation: `${TGA_V13_NAMESPACE}IOrganisationService/SearchOrganisation`,
  
  // Training component service operations  
  getTrainingComponentDetails: `${TGA_V13_NAMESPACE}ITrainingComponentService/GetDetails`,
  searchTrainingComponent: `${TGA_V13_NAMESPACE}ITrainingComponentService/Search`,
} as const;

/**
 * SOAP XML Namespaces used in TGA requests/responses.
 */
export const TGA_SOAP_NAMESPACES = {
  // SOAP 1.1 envelope (TGA uses basicHttpBinding)
  soap11: 'http://schemas.xmlsoap.org/soap/envelope/',
  // WS-Security namespaces
  wsse: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd',
  wsu: 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd',
  // Service namespace (V13)
  tns: TGA_V13_NAMESPACE,
} as const;
