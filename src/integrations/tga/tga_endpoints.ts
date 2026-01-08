/**
 * TGA (Training.gov.au) SOAP Service Endpoints
 * 
 * Source of truth for TGA Web Services URLs.
 * Per TGA Web Services Specification v13r1.
 * 
 * IMPORTANT:
 * - OrganisationServiceV13 uses 'WebServices' (capital S)
 * - TrainingComponentServiceV13 and ClassificationServiceV13 use 'Webservices' (lowercase s)
 * - V13 IS part of the URL path (e.g., OrganisationServiceV13.svc)
 */

export type TGAEnvironment = 'prod' | 'sandbox';

export interface TGAEndpoints {
  organisation: string;
  training: string;
  classification: string;
}

/**
 * Get TGA SOAP service endpoints for the specified environment.
 * 
 * @param env - 'prod' for production, 'sandbox' for testing
 * @returns Object with organisation, training, and classification URLs
 */
export function getTgaEndpoints(env: TGAEnvironment = 'prod'): TGAEndpoints {
  const baseHost = env === 'sandbox' 
    ? 'ws.sandbox.training.gov.au' 
    : 'ws.training.gov.au';

  return {
    // OrganisationServiceV13 uses WebServices (capital S)
    organisation: `https://${baseHost}/Deewr.Tga.WebServices/OrganisationServiceV13.svc`,
    // TrainingComponentServiceV13 and ClassificationServiceV13 use Webservices (lowercase s)
    training: `https://${baseHost}/Deewr.Tga.Webservices/TrainingComponentServiceV13.svc`,
    classification: `https://${baseHost}/Deewr.Tga.Webservices/ClassificationServiceV13.svc`,
  };
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
