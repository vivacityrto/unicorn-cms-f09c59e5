/**
 * TGA (Training.gov.au) SOAP Service Endpoints
 * 
 * Source of truth for TGA Web Services URLs.
 * Per TGA Web Services Specification v13r1.
 * 
 * IMPORTANT:
 * - OrganisationService uses 'WebServices' (capital S)
 * - TrainingComponentService and ClassificationService use 'Webservices' (lowercase s)
 * - V13 is in the SOAP contract/action, NOT in the URL path
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
    // OrganisationService uses WebServices (capital S)
    organisation: `https://${baseHost}/Deewr.Tga.WebServices/OrganisationService.svc`,
    // TrainingComponentService and ClassificationService use Webservices (lowercase s)
    training: `https://${baseHost}/Deewr.Tga.Webservices/TrainingComponentService.svc`,
    classification: `https://${baseHost}/Deewr.Tga.Webservices/ClassificationService.svc`,
  };
}

/**
 * SOAP Action URIs for TGA services.
 * These include the version number (v13) in the namespace.
 */
export const TGA_SOAP_ACTIONS = {
  // Organisation service operations
  getOrganisationDetails: 'http://training.gov.au/services/Organisation/IOrganisationService/GetDetails',
  searchOrganisation: 'http://training.gov.au/services/Organisation/IOrganisationService/Search',
  
  // Training component service operations  
  getTrainingComponentDetails: 'http://training.gov.au/services/TrainingComponent/ITrainingComponentService/GetDetails',
  searchTrainingComponent: 'http://training.gov.au/services/TrainingComponent/ITrainingComponentService/Search',
} as const;

/**
 * SOAP XML Namespaces used in TGA requests/responses.
 */
export const TGA_SOAP_NAMESPACES = {
  // SOAP 1.1 envelope (TGA uses basicHttpBinding)
  soap11: 'http://schemas.xmlsoap.org/soap/envelope/',
  // Service-specific namespaces
  organisation: 'http://training.gov.au/services/Organisation',
  trainingComponent: 'http://training.gov.au/services/TrainingComponent',
} as const;
