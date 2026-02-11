/**
 * Workflow guides for common GTM setup tasks
 */

export interface WorkflowStep {
  step: number;
  action: string;
  tool: string;
  description: string;
  parameters?: any;
  notes?: string[];
}

export interface WorkflowGuide {
  id: string;
  name: string;
  description: string;
  prerequisites: string[];
  steps: WorkflowStep[];
  estimatedTime: string;
  containerType: 'web' | 'server' | 'both';
}

const WORKFLOWS: Record<string, WorkflowGuide> = {
  setup_ga4: {
    id: 'setup_ga4',
    name: 'GA4 Basic Setup',
    description: 'Set up Google Analytics 4 tracking with pageviews and basic events',
    prerequisites: [
      'GA4 Property must exist in Google Analytics',
      'Measurement ID must be available (G-XXXXXXXXXX)',
      'Container must be a Web container',
    ],
    estimatedTime: '10-15 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Create Google tag (gtag.js)',
        tool: 'gtm_create_tag',
        description: 'Creates the Google tag configuration for GA4',
        parameters: {
          type: 'googtag',
          name: 'Google tag - GA4',
          parameter: [
            { key: 'tagId', type: 'template', value: 'YOUR_MEASUREMENT_ID' }
          ],
        },
        notes: [
          'Replace YOUR_MEASUREMENT_ID with your actual GA4 Measurement ID (e.g., G-XXXXXXXXXX)',
          'This tag should fire on all pages',
        ],
      },
      {
        step: 2,
        action: 'Create All Pages Trigger',
        tool: 'gtm_create_trigger',
        description: 'Creates a trigger that fires on all page views',
        parameters: {
          type: 'pageview',
          name: 'All Pages',
          filter: [],
        },
        notes: [
          'No filter = fires on all pages',
          'This is the standard initialization trigger',
        ],
      },
      {
        step: 3,
        action: 'Link Trigger to Tag',
        tool: 'gtm_create_tag',
        description: 'Update the tag with the trigger ID',
        notes: [
          'Get the triggerId from step 2',
          'Add it to firingTriggerId array',
          'Save and test in preview mode',
        ],
      },
      {
        step: 4,
        action: 'Test in Preview Mode',
        tool: 'gtm_get_workspace_status',
        description: 'Check workspace status and test the setup',
        notes: [
          'Open GTM Preview mode',
          'Navigate to your website',
          'Verify GA4 tag fires on page load',
          'Check GA4 Real-Time reports',
        ],
      },
    ],
  },

  setup_conversion_tracking: {
    id: 'setup_conversion_tracking',
    name: 'Google Ads Conversion Tracking',
    description: 'Set up conversion tracking for Google Ads campaigns',
    prerequisites: [
      'Google Ads account with conversion action created',
      'Conversion ID and Label from Google Ads',
      'Container must be a Web container',
      'GA4 already set up (recommended)',
    ],
    estimatedTime: '10-15 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Create Conversion Trigger',
        tool: 'gtm_create_trigger',
        description: 'Create trigger for conversion event',
        parameters: {
          type: 'pageview',
          name: 'Conversion - Thank You Page',
          filter: [
            {
              type: 'contains',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{Page URL}}' },
                { key: 'arg1', type: 'template', value: '/thank-you' },
              ],
            },
          ],
        },
        notes: [
          'Modify filter to match your conversion page URL',
          'Could also use customEvent trigger for dataLayer events',
        ],
      },
      {
        step: 2,
        action: 'Create Conversion Tag',
        tool: 'gtm_create_tag',
        description: 'Create Google Ads conversion tracking tag',
        parameters: {
          type: 'awct',
          name: 'Google Ads - Conversion',
          parameter: [
            { key: 'conversionId', type: 'template', value: 'AW-XXXXXXXX' },
            { key: 'conversionLabel', type: 'template', value: 'abc123' },
            { key: 'conversionValue', type: 'template', value: '0' },
            { key: 'currencyCode', type: 'template', value: 'USD' },
          ],
        },
        notes: [
          'Replace AW-XXXXXXXX with your Conversion ID',
          'Replace abc123 with your Conversion Label',
          'Get these from Google Ads > Conversions',
        ],
      },
      {
        step: 3,
        action: 'Link Trigger to Tag',
        tool: 'gtm_create_tag',
        description: 'Add the trigger ID to firingTriggerId',
        notes: [
          'Use triggerId from step 1',
          'Save and test in preview mode',
        ],
      },
    ],
  },

  setup_form_tracking: {
    id: 'setup_form_tracking',
    name: 'Form Submission Tracking',
    description: 'Track form submissions with GA4 events',
    prerequisites: [
      'GA4 already set up (run setup_ga4 first)',
      'Know which forms to track',
    ],
    estimatedTime: '10 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Create Form Submit Trigger',
        tool: 'gtm_create_trigger',
        description: 'Create trigger for form submission',
        parameters: {
          type: 'formSubmission',
          name: 'Form - Contact Form',
          filter: [
            {
              type: 'contains',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{Form ID}}' },
                { key: 'arg1', type: 'template', value: 'contact-form' },
              ],
            },
          ],
        },
        notes: [
          'Replace "contact-form" with your actual form ID',
          'Remove filter to track ALL form submissions',
          'Can also filter by Form Class or Form URL',
        ],
      },
      {
        step: 2,
        action: 'Create Form Event Tag',
        tool: 'gtm_create_tag',
        description: 'Create GA4 event tag for form submission',
        parameters: {
          type: 'gaawe',
          name: 'GA4 - Form Submit',
          parameter: [
            { key: 'measurementId', type: 'template', value: 'YOUR_MEASUREMENT_ID' },
            { key: 'eventName', type: 'template', value: 'form_submit' },
            {
              key: 'eventSettingsTable',
              type: 'list',
              list: [
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'form_id' },
                    { key: 'parameterValue', type: 'template', value: '{{Form ID}}' },
                  ],
                },
              ],
            },
          ],
        },
        notes: [
          'Replace YOUR_MEASUREMENT_ID with your GA4 ID',
          'eventName can be customized (e.g., "generate_lead")',
        ],
      },
      {
        step: 3,
        action: 'Link Trigger to Tag',
        tool: 'gtm_create_tag',
        description: 'Add trigger ID to firingTriggerId',
      },
    ],
  },

  setup_scroll_tracking: {
    id: 'setup_scroll_tracking',
    name: 'Scroll Depth Tracking',
    description: 'Track how far users scroll on pages',
    prerequisites: [
      'GA4 already set up (run setup_ga4 first)',
    ],
    estimatedTime: '5-10 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Enable Built-in Variables',
        tool: 'gtm_enable_built_in_variables',
        description: 'Enable scroll-related built-in variables',
        parameters: {
          types: ['SCROLL_DEPTH_THRESHOLD', 'SCROLL_DIRECTION'],
        },
        notes: [
          'These variables are needed for scroll tracking',
        ],
      },
      {
        step: 2,
        action: 'Create Scroll Depth Trigger',
        tool: 'gtm_create_trigger',
        description: 'Create scroll trigger',
        parameters: {
          type: 'scrollDepth',
          name: 'Scroll - Depth Tracking',
          filter: [],
        },
        notes: [
          'Configure vertical scroll percentages in GTM UI',
          'Common thresholds: 25%, 50%, 75%, 90%',
          'No filter needed to track on all pages',
        ],
      },
      {
        step: 3,
        action: 'Create Scroll Event Tag',
        tool: 'gtm_create_tag',
        description: 'Create GA4 event tag for scroll tracking',
        parameters: {
          type: 'gaawe',
          name: 'GA4 - Scroll',
          parameter: [
            { key: 'measurementId', type: 'template', value: 'YOUR_MEASUREMENT_ID' },
            { key: 'eventName', type: 'template', value: 'scroll' },
            {
              key: 'eventSettingsTable',
              type: 'list',
              list: [
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'percent_scrolled' },
                    { key: 'parameterValue', type: 'template', value: '{{Scroll Depth Threshold}}' },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },

  setup_link_click_tracking: {
    id: 'setup_link_click_tracking',
    name: 'Link Click Tracking',
    description: 'Track clicks on internal and external links',
    prerequisites: [
      'GA4 already set up (run setup_ga4 first)',
    ],
    estimatedTime: '10 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Enable Built-in Variables',
        tool: 'gtm_enable_built_in_variables',
        description: 'Enable click-related built-in variables',
        parameters: {
          types: ['CLICK_URL', 'CLICK_TEXT', 'CLICK_CLASSES', 'CLICK_ID'],
        },
      },
      {
        step: 2,
        action: 'Create Link Click Trigger',
        tool: 'gtm_create_trigger',
        description: 'Create trigger for link clicks',
        parameters: {
          type: 'linkClick',
          name: 'Click - All Links',
          filter: [],
        },
        notes: [
          'Leave filter empty to track all link clicks',
          'Add filter to track only external links:',
          'filter: [{ type: "matchRegex", parameter: [{ key: "arg0", value: "{{Click URL}}" }, { key: "arg1", value: "^https?://(?!example\\.com)" }] }]',
        ],
      },
      {
        step: 3,
        action: 'Create Link Click Event Tag',
        tool: 'gtm_create_tag',
        description: 'Create GA4 event tag for link clicks',
        parameters: {
          type: 'gaawe',
          name: 'GA4 - Link Click',
          parameter: [
            { key: 'measurementId', type: 'template', value: 'YOUR_MEASUREMENT_ID' },
            { key: 'eventName', type: 'template', value: 'click' },
            {
              key: 'eventSettingsTable',
              type: 'list',
              list: [
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'link_url' },
                    { key: 'parameterValue', type: 'template', value: '{{Click URL}}' },
                  ],
                },
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'link_text' },
                    { key: 'parameterValue', type: 'template', value: '{{Click Text}}' },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  },

  setup_ecommerce_tracking: {
    id: 'setup_ecommerce_tracking',
    name: 'E-Commerce Tracking (GA4)',
    description: 'Complete e-commerce tracking with purchase events and product data',
    prerequisites: [
      'GA4 already set up (run setup_ga4 first)',
      'Website pushes ecommerce data to dataLayer',
      'Purchase event pushes: ecommerce.items, ecommerce.value, ecommerce.transaction_id',
      'Product data includes: item_id, item_name, price, quantity',
    ],
    estimatedTime: '20-30 minutes',
    containerType: 'web',
    steps: [
      {
        step: 1,
        action: 'Create E-Commerce Data Layer Variables',
        tool: 'gtm_create_variable',
        description: 'Create variables to access ecommerce data from dataLayer',
        parameters: {
          type: 'f',
          name: 'DLV - E-Commerce Items',
          parameter: [
            { key: 'dataLayerName', type: 'template', value: 'ecommerce.items' },
          ],
        },
        notes: [
          'Create additional variables for:',
          '- ecommerce.transaction_id',
          '- ecommerce.value',
          '- ecommerce.currency',
          '- ecommerce.shipping',
          '- ecommerce.tax',
        ],
      },
      {
        step: 2,
        action: 'Create Purchase Event Trigger',
        tool: 'gtm_create_trigger',
        description: 'Trigger that fires when purchase event is pushed',
        parameters: {
          type: 'customEvent',
          name: 'CE - Purchase',
          customEventFilter: [
            {
              type: 'equals',
              parameter: [
                { key: 'arg0', type: 'template', value: '{{_event}}' },
                { key: 'arg1', type: 'template', value: 'purchase' },
              ],
            },
          ],
        },
        notes: [
          'Expects dataLayer.push({ event: "purchase", ecommerce: {...} })',
          'Event name can be customized',
        ],
      },
      {
        step: 3,
        action: 'Create GA4 Purchase Tag',
        tool: 'gtm_create_tag',
        description: 'GA4 event tag for purchase with ecommerce data',
        parameters: {
          type: 'gaawe',
          name: 'GA4 - Purchase',
          parameter: [
            { key: 'measurementId', type: 'template', value: 'YOUR_MEASUREMENT_ID' },
            { key: 'eventName', type: 'template', value: 'purchase' },
            { key: 'sendEcommerceData', type: 'boolean', value: 'true' },
            { key: 'getEcommerceDataFrom', type: 'template', value: 'dataLayer' },
            {
              key: 'eventSettingsTable',
              type: 'list',
              list: [
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'transaction_id' },
                    { key: 'parameterValue', type: 'template', value: '{{DLV - Transaction ID}}' },
                  ],
                },
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'value' },
                    { key: 'parameterValue', type: 'template', value: '{{DLV - Purchase Value}}' },
                  ],
                },
                {
                  type: 'map',
                  map: [
                    { key: 'parameter', type: 'template', value: 'currency' },
                    { key: 'parameterValue', type: 'template', value: '{{DLV - Currency}}' },
                  ],
                },
              ],
            },
          ],
        },
        notes: [
          'sendEcommerceData: true automatically sends items array',
          'Ensure dataLayer follows GA4 ecommerce schema',
          'Reference: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce',
        ],
      },
      {
        step: 4,
        action: 'Create Additional E-Commerce Triggers (Optional)',
        tool: 'gtm_create_trigger',
        description: 'Create triggers for other ecommerce events',
        notes: [
          'Common ecommerce events:',
          '- view_item_list (product listing)',
          '- select_item (product click)',
          '- view_item (product detail)',
          '- add_to_cart',
          '- remove_from_cart',
          '- begin_checkout',
          '- add_shipping_info',
          '- add_payment_info',
          '- purchase (already created)',
        ],
      },
      {
        step: 5,
        action: 'Test E-Commerce Tracking',
        tool: 'gtm_get_workspace_status',
        description: 'Verify ecommerce tracking in preview mode',
        notes: [
          'Complete a test purchase',
          'Verify purchase event fires with correct data',
          'Check GA4 DebugView for event parameters',
          'Verify items array is populated correctly',
        ],
      },
    ],
  },
};

export function getWorkflow(workflowId: string): WorkflowGuide | null {
  return WORKFLOWS[workflowId] || null;
}

export function getAllWorkflows(): { id: string; name: string; description: string; containerType: string }[] {
  return Object.values(WORKFLOWS).map(w => ({
    id: w.id,
    name: w.name,
    description: w.description,
    containerType: w.containerType,
  }));
}

export function getWorkflowsByContainerType(containerType: 'web' | 'server'): WorkflowGuide[] {
  return Object.values(WORKFLOWS).filter(w => 
    w.containerType === containerType || w.containerType === 'both'
  );
}

export function customizeWorkflow(
  workflowId: string, 
  measurementId?: string,
  containerPath?: string
): WorkflowGuide | null {
  const workflow = WORKFLOWS[workflowId];
  if (!workflow) return null;

  const customizedSteps = workflow.steps.map(step => {
    if (!step.parameters) return step;
    
    const paramString = JSON.stringify(step.parameters);
    const customized = paramString
      .replace(/YOUR_MEASUREMENT_ID/g, measurementId || 'G-XXXXXXXXXX')
      .replace(/YOUR_CONTAINER_PATH/g, containerPath || 'accounts/123/containers/456');
    
    return {
      ...step,
      parameters: JSON.parse(customized),
    };
  });

  return {
    ...workflow,
    steps: customizedSteps,
  };
}
