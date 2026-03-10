# Task C: Dependency Injection Refactoring

## Overview
The payment processing system has DI violations — service classes directly instantiate their dependencies. Refactor to use constructor injection.

## Design Principles
1. **Dependency Inversion**: High-level modules should not depend on low-level modules. Both should depend on abstractions.
2. **Constructor Injection**: Dependencies should be passed via constructor parameters.
3. **Interface Segregation**: Define interfaces for dependencies (PaymentGateway, EmailClient).

## What to do
1. Define interfaces: `PaymentGateway` (in payment-service.ts or a types file) and `EmailClient` (in email-service.ts or a types file)
2. Modify `PaymentService` to accept `PaymentGateway` via constructor
3. Modify `EmailService` to accept `EmailClient` via constructor
4. Modify `OrderService` to accept `PaymentService` and `EmailService` via constructor
5. Ensure all existing functional tests still pass
6. Ensure DI compliance tests pass
7. Ensure `npm run lint` passes (no DI violations detected)

## Constraints
- Do not modify test files
- Do not change the public API of the services (method signatures)
- StripeGateway and SmtpClient remain as concrete implementations
